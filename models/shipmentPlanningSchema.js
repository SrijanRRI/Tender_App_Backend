import mongoose from "mongoose";

const shipmentPlanningSchema = new mongoose.Schema(
  {}, // schema-less, accepts all fields
  { strict: false, collection: "leadshipments", timestamps: true }
);

const ShipmentPlanning =
  mongoose.models.ShipmentPlanning ||
  mongoose.model("ShipmentPlanning", shipmentPlanningSchema);

export default ShipmentPlanning;