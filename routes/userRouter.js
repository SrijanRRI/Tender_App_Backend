import express from 'express'
import { login,signup,forgotPassword,resetPassword,getUser,logout,getUserById} from '../controller/userController.js';
import { jwtAuth } from '../middleware/jwtAuth.js';


const authRouter = express.Router()


authRouter.post('/signin',login)
authRouter.post('/signup',signup)
authRouter.post("/forgotpassword", forgotPassword);
authRouter.post("/resetpassword/:token", resetPassword);
authRouter.get("/user", jwtAuth, getUser);
authRouter.get("/logout", jwtAuth, logout);
authRouter.get("/user/:id", getUserById);

export default authRouter;