import mongoose from "mongoose";

const quotationSchema = new mongoose.Schema({
  tender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Tender",
    required: true,
  },
  transportUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
    required: true,
  },
  price: { type: Number, required: true },
  vehicleNumber: { type: String, required: true },
  files: [String],
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("Quotation", quotationSchema);
