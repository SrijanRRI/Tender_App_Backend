import express from 'express';
import { 
  getPendingApprovals, 
  approveUser, 
  rejectUser,
  getApprovedTransportUsers
} from '../controller/adminController.js'

const adminRouter = express.Router();



// Admin routes for user approval
adminRouter.get('/pending-approvals', getPendingApprovals);
adminRouter.put('/approve-user/:userId', approveUser);
adminRouter.delete('/reject-user/:userId', rejectUser);
adminRouter.get('/transport-users', getApprovedTransportUsers);

export default adminRouter;