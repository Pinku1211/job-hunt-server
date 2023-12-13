const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const multer = require('multer')
const cookieParser = require('cookie-parser')

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const app = express();
const port = process.env.PORT || 5000;

// middleware

app.use(cors({
  origin: [
    // 'http://localhost:5174',
    'https://job-hunt-f101c.web.app',
    'https://job-hunt-f101c.firebaseapp.com'

  ],
}));
app.use(express.json());
app.use(cookieParser());
app.use("/files", express.static("files"))


const uri = `mongodb+srv://${process.env.DB_USERS}:${process.env.DB_PASSW}@cluster0.r8pib.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

// middlewares 
// const logger = (req, res, next) => {
//   console.log('log: info', req.method, req.url);
//   next();
// };

const verifyToken = (req, res, next) => {
  const token = req?.cookies?.token;
  if (!token) {
    return res.status(401).send({ message: 'unauthorized access' })
  }
  jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: 'unauthorized access' })
    }
    req.user = decoded;
    next();
  })
}


async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const jobCollection = client.db('jobHunt').collection('jobs');
    const applicantCollection = client.db('jobHunt').collection('applicants');
    const userCollection = client.db('jobHunt').collection('users');
    const pdfCollection = client.db('jobHunt').collection('pdfDetails');

    // auth api
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      console.log('user for token', user);
      const token = jwt.sign(user, process.env.ACCESS_TOKEN, { expiresIn: '1h' })
      res.cookie('token', token, {
        httpOnly: true,
        secure: true,
        sameSite: 'none'
      })
        .send({ token })
    })

    app.post('/logout', async (req, res) => {
      const user = req.body;
      console.log('logging out', user)
      res.clearCookie('token', { maxAge: 0 }).send({ success: true })

    })

    // services api
    app.get('/jobs', async (req, res) => {
      const cursor = jobCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    })
    

    app.post('/jobs', async (req, res) => {
      const newJob = req.body[0];
      const subscribers = req.body[1]
      sendEmailNotifications(subscribers, newJob);
      const result = await jobCollection.insertOne(newJob)
      res.send(result)
    })
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: process.env.SMTP_MAIL,
        pass: process.env.SMTP_PASSWORD ,
      },
    });
    
    const sendEmailNotifications = (subscribers, newJob) => {
      const mailOptions = {
        from: process.env.SMTP_MAIL,
        to: subscribers,
        subject: 'New Job Listing Alert',
        text: `A new job "${newJob?.job_title}" has been added. Check it out!`,
      };
      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          console.error(error);
        } else {
          console.log('Email sent: ' + info.response);
        }
      });
    }
    

    

      app.get('/jobs/:id', async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await jobCollection.findOne(query);
        res.send(result);
      })

      // users
      app.put('/users/:email', async (req, res) => {
        const email = req.params.email
        const user = req.body
        const query = { email: email }
        const options = { upsert: true }
        const isExist = await userCollection.findOne(query)
        console.log('User', isExist)
        if (isExist) return res.send(isExist)
        const result = await userCollection.updateOne(
          query,
          {
            $set: { ...user, timestamp: Date.now() },
          },
          options
        )
        res.send(result)
      })
      app.get('/users', async (req, res) => {
        const cursor = userCollection.find();
        const result = await cursor.toArray();
        res.send(result);
      })

      // applicants
      app.put('/applicants/:id', async (req, res) => {
        const id = req.params.id;
        const query = { jobId: id }
        const result1 = await applicantCollection.findOne(query)
        const filter = { _id: new ObjectId(result1.jobId) }
        const update = {
          $inc: {
            "applicants_number": 1
          }
        }
        const result = await jobCollection.updateOne(filter, update);
        res.send(result)
      })


      app.get('/applicants', async (req, res) => {
        let query = {}
        if (req.query) {
          query = { email: req.query.email }
        }
        const result = await applicantCollection.find(query).toArray();

        res.send(result)
      })

      app.post('/applicants', async (req, res) => {
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
            applicants_number: parseInt(updatedJob.applicants_number),
          }
        }
        const result = await jobCollection.updateOne(filter, job, options);
        res.send(result)
      })

      // upload cv
      const storage = multer.diskStorage({
        destination: function (req, file, cb) {
          cb(null, './files'); 
        },
        filename: function (req, file, cb) {
          const uniqueSuffix = Date.now()
          cb(null, uniqueSuffix + file.originalname); 
        },
      });

      
      const upload = multer({storage: storage})

      app.post('/upload-files', upload.single("file"), async(req, res) => {
        console.log(req.file)
        console.log(req.body)
        const title = req.body.title
        const email = req.body.email
        const fileName = req.file?.filename
        const result = await pdfCollection.insertOne({title: title, pdf: fileName, email: email })
        res.send(result)
       
      })

      // get all the resume
      app.get('/get-files', async (req, res)=> {
        const cursor = pdfCollection.find();
        const result = await cursor.toArray();
        res.send(result);
      })

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