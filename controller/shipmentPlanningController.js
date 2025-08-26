import mongoose from "mongoose";
import ShipmentPlanning from "../models/shipmentPlanningSchema.js";

// GET /api/shipment-planning -> return all
export const getAllShipments = async (_req, res) => {
  try {
    const shipments = await ShipmentPlanning.find().sort({ createdAt: -1 }).lean();
    res.json(shipments);
  } catch (err) {
    console.error("getAllShipments error:", err);
    res.status(500).json({ message: "Failed to fetch shipments" });
  }
};

// GET /api/shipment-planning/:id -> return single
export const getShipmentById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid id" });
    }
    const doc = await ShipmentPlanning.findById(id).lean();
    if (!doc) return res.status(404).json({ message: "Not found" });
    res.json(doc);
  } catch (err) {
    console.error("getShipmentById error:", err);
    res.status(500).json({ message: "Failed to fetch shipment" });
  }
};

// PUT /api/shipment-planning/:id -> update status only
export const updateShipmentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid id" });
    }
    if (typeof status !== "string" || !status.trim()) {
      return res.status(400).json({ message: "status is required (string)" });
    }

    const updated = await ShipmentPlanning.findByIdAndUpdate(
      id,
      { status: status.trim() },
      { new: true }
    ).lean();

    if (!updated) return res.status(404).json({ message: "Shipment not found" });
    res.json(updated);
  } catch (err) {
    console.error("updateShipmentStatus error:", err);
    res.status(500).json({ message: "Failed to update shipment" });
  }
};
