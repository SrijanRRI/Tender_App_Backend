import express from 'express'
import authRouter from './routes/userRoute.js';
import adminRouter from './routes/adminRoute.js';
import transportRouter from './routes/transportUserRoute.js'
import tenderRouter from './routes/tenderRouter.js';
import connectToDb from './config/dbConn.js';
import cookieParser from 'cookie-parser'
import cors from 'cors';
const app = express();
connectToDb()
app.use(express.json()); // Built-in middleware
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser()); // Third-party middleware


app.use(cors({ origin: [process.env.CLIENT_URL], credentials: true }));

app.use('/api/auth',authRouter)
app.use('/admin', adminRouter);
app.use('/tenders',tenderRouter)


export default app;