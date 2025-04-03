// routes/tenderRoutes.js
import express from 'express';
import { createTender, getTenderQuotations, finalizeTender } from '../controller/tenderController.js';
import { submitQuotation } from '../controller/quotationController.js';
import jwtAuth, { isApproved } from '../middleware/jwtAuth.js';

const tenderRouter = express.Router();

tenderRouter.post('/tenders', jwtAuth, isApproved, createTender);
tenderRouter.get('/tenders/:id/quotations', jwtAuth, isApproved, getTenderQuotations);
tenderRouter.post('/tenders/:id/finalize', jwtAuth, isApproved, finalizeTender);
tenderRouter.post('/tenders/:id/quotations', jwtAuth, isApproved, submitQuotation);

export default tenderRouter;
2