const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser')

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const app = express();
const port = process.env.PORT || 5000;

// middleware

app.use(cors({
  origin: [
    'http://localhost:5173'
  ],
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.r8pib.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

// middlewares 
const logger = (req, res, next) => {
  console.log('log: info',req.method, req.url);
  next();
};

const verifyToken = (req, res, next) => {
  const token = req?.cookies?.token;
  if(!token){
    return res.status(401).send({message: 'unauthorized access'})
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if(err){
      return res.status(401).send({message: 'unauthorized access'})
    }
    req.user = decoded;
    next();
  })
}


async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const jobCollection = client.db('jobHunt').collection('jobs');
    const applicantCollection = client.db('jobHunt').collection('applicants');

    // auth api
    app.post('/jwt', logger, async(req, res)=>{
      const user = req.body;
      console.log('user for token', user);
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {expiresIn: '1h'})
      res.cookie('token', token, {
        httpOnly: true,
        secure: true,
        sameSite: 'none'
      })
      .send({token})
    })

    app.post('/logout', async(req, res) => {
      const user = req.body;
      console.log('logging out', user)
      res.clearCookie('token', {maxAge: 0}).send({success: true})

    })

    // services api
    app.get('/jobs', logger, async (req, res) => {
      const cursor = jobCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    })

    app.post('/jobs', async (req, res) => {
      const newJob = req.body;
      const result = await jobCollection.insertOne(newJob)
      res.send(result)
    })

    app.get('/jobs/:id', logger, verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await jobCollection.findOne(query);
      res.send(result);
    })

    app.get('/applicants', verifyToken, logger, async(req, res) => {
      let query = {};
      if(req.query?.email){
        query = {email: req.query.email}
      }
      if(req.user.email !== req.query.email){
        return res.status(403).send({message: 'forbidden access'})
      }
      const result = await applicantCollection.find(query).toArray();
      res.send(result)
    })

    app.post('/applicants', logger, async (req, res) => {
      const newApplicant = req.body;
      const result = await applicantCollection.insertOne(newApplicant)
      res.send(result)
    })

    app.delete('/jobs/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await jobCollection.deleteOne(query)
      res.send(result)
    })

    app.put('/jobs/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const updatedJob = req.body;
      const job = {
        $set: {
          job_banner: updatedJob.job_banner,
          name_posted: updatedJob.name_posted,
          job_title: updatedJob.job_title,
          job_category: updatedJob.job_category,
          salary_range: updatedJob.salary_range,
          description: updatedJob.description,
          job_posting_date: updatedJob.job_posting_date,
          application_deadline: updatedJob.application_deadline,
          applicants_number: updatedJob.applicants_number,
        }
      }
      const result = await jobCollection.updateOne(filter, job, options);
      res.send(result)
    })

    // app.put('/jobs/:id', async (req, res) => {
    //   const id = req.params.id;
    //   const query = { _id: new ObjectId(id) };
    //   const job = {
    //     $inc: {
    //       applicants_number: 1
    //     }
    //   }
    //   const result = await jobCollection.updateOne(query, job);
    //   res.send(result)
    // })

    




    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('job-hunt is running')
});

app.listen(port, () => {
  console.log(`job-hunt server is running on port:${port}`)
});