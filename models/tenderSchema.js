import mongoose from "mongoose";

const tenderSchema = new mongoose.Schema(
  {
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },

    // ✅ Replacing single date with delivery window (range)
    deliveryWindow: {
      from: { type: Date, required: true },
      to: { type: Date, required: true },
    },

    closeDate: { type: Date, required: true },
    dispatchLocation: { type: String, required: true },
    address: { type: String, required: true },
    pincode: { type: String, required: true },

    materials: [
      {
        material: { type: String, required: true },
        subMaterial: { type: String, default: "", trim: true },
        weight: { type: Number },
        quantity: { type: Number },
      },
    ],

    totalWeight: { type: Number, required: true },
    totalQuantity: { type: Number, required: true },

    remarks: { type: String, default: "", trim: true },

    status: {
      type: String,
      enum: ["open", "quoted", "finalized", "closed"],
      default: "open",
    },

    transporters: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user",
        required: true,
      },
    ],

    quotations: [{ type: mongoose.Schema.Types.ObjectId, ref: "Quotation" }],

    selectedQuotation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Quotation",
    },

    finalPrice: {
      type: Number,
      required: function () {
        return this.status === "finalized" || this.status === "closed";
      },
    },
    projectName: { type: String, required: true },
    projectCode: { type: String, required: true },
    purchaseOrder: { type: String, required: true, trim: true },
    projectRemark: { type: String, default: "", trim: true },
  },
  { timestamps: true }
);

export default mongoose.model("Tender", tenderSchema);
