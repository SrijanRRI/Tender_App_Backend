import mongoose from "mongoose";

const fileSchema = new mongoose.Schema({
  url: { type: String, required: true },
  originalName: { type: String },
  mimetype: { type: String },
  uploadedAt: { type: Date, default: Date.now },
});

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
  files: [fileSchema], // Array of file metadata
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("Quotation", quotationSchema);
