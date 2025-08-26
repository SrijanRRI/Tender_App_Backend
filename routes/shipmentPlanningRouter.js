import express from "express";
import {
  getAllShipments,
  getShipmentById,
  updateShipmentStatus,
} from "../controller/shipmentPlanningController.js";

const shipmentRouter = express.Router();

shipmentRouter.get("/", getAllShipments);          // GET all
shipmentRouter.get("/:id", getShipmentById);       // GET by id
shipmentRouter.put("/:id", updateShipmentStatus);  // PUT update status

export default shipmentRouter;
