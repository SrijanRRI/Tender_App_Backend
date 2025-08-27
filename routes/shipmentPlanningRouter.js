import express from "express";
import {
  getShipmentById,
  listShipments,
  updateShipmentStatus,
} from "../controller/shipmentPlanningController.js";

const shipmentRouter = express.Router();

shipmentRouter.get("/",listShipments );          // GET all
shipmentRouter.get("/:id", getShipmentById);       // GET by id
shipmentRouter.put("/:id", updateShipmentStatus);  // PUT update status

export default shipmentRouter;
