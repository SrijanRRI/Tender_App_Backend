// controllers/quotationController.js
import Quotation from "../models/tenderSchema.js";
import Tender from "../models/quotationSchema.js";

export const submitQuotation = async (req, res) => {
  try {
    const { price, vehicleNumber, files } = req.body;
    const tender = await Tender.findById(req.params.id);
    if (!tender || tender.status !== "open") {
      return res
        .status(400)
        .json({ success: false, message: "Tender is not open for quotation" });
    }

    const existing = await Quotation.findOne({
      tender: tender._id,
      transportUser: req.user.id,
    });
    if (existing) {
      return res
        .status(400)
        .json({
          success: false,
          message: "You have already submitted a quotation",
        });
    }

    const quotation = new Quotation({
      tender: tender._id,
      transportUser: req.user.id,
      price,
      vehicleNumber,
      files: files || [],
    });

    await quotation.save();
    tender.quotations.push(quotation._id);
    await tender.save();
    res.status(201).json({ success: true, data: quotation });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};
