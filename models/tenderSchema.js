import mongoose from "mongoose";

const tenderSchema = new mongoose.Schema(
  {
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },

    dateOfDelivery: { type: Date, required: true },
    dispatchLocation: { type: String, required: true },
    address: { type: String, required: true },
    pincode: { type: String, required: true },

    materials: [
      {
        materialDetails: { type: String, required: true },
        weight: { type: Number, required: true },
        quantity: { type: Number, required: true },
      },
    ],

    totalWeight: { type: Number, required: true },
    totalQuantity: { type: Number, required: true },

    status: {
      type: String,
      enum: ["open", "quoted", "finalized", "closed"],
      default: "open",
    },

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
  },
  { timestamps: true }
);

export default mongoose.model("Tender", tenderSchema);
