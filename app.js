import express from 'express'
import dotenv from 'dotenv';
dotenv.config();
import authRouter from './routes/userRouter.js';
import adminRouter from './routes/adminRouter.js';
import quotationRouter from './routes/quotationRouter.js';
import "./cron/autoCloseTenders.js";
import tenderRouter from './routes/tenderRouter.js';
import connectToDb from './config/dbConn.js';
import cookieParser from 'cookie-parser'
import cors from 'cors';
const app = express();
connectToDb()

app.use(cors({ origin: [process.env.CLIENT_URL], credentials: true }));


app.use(express.json()); // Built-in middleware
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser()); // Third-party middleware




app.use('/api/auth',authRouter)
app.use('/admin', adminRouter);
app.use('/tenders',tenderRouter)
app.use('/quotation', quotationRouter);


export default app;