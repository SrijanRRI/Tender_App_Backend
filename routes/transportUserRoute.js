import express from 'express';
import { jwtAuth, isApproved } from '../middleware/jwtAuth.js';

const transportRouter= express.Router();

// Example transport user routes
// You would need to create these controllers
transportRouter.use(jwtAuth, isApproved);

// Add your transport user specific routes here
// router.get('/dashboard', transportController.getDashboard);
// router.post('/create-shipment', transportController.createShipment);
// etc.

export default transportRouter;