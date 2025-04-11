import express from 'express'
import { login,signup,forgotPassword,resetPassword,getUser,logout,getAllUsers,getCurrentUser} from '../controller/userController.js';
import { jwtAuth } from '../middleware/jwtAuth.js';


const authRouter = express.Router()


authRouter.post('/signin',login)
authRouter.post('/signup',signup)
authRouter.post("/forgotpassword", forgotPassword);
authRouter.post("/resetpassword/:token", resetPassword);
authRouter.get("/user", jwtAuth, getUser);
authRouter.post("/logout", jwtAuth, logout);
authRouter.get("/user/all", getAllUsers);
authRouter.get("/me", jwtAuth, getCurrentUser);

export default authRouter;