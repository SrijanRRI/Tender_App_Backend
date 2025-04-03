// controllers/tenderController.js
import Tender from "../models/tenderSchema.js";
import Quotation from "../models/quotationSchema.js";

export const createTender = async (req, res) => {
  try {
    const { materials } = req.body;

    if (!materials || !Array.isArray(materials) || materials.length === 0) {
      return res
        .status(400)
        .json({
          success: false,
          message: "At least one material entry is required",
        });
    }

    let totalWeight = 0;
    let totalQuantity = 0;

    materials.forEach((item) => {
      totalWeight += item.weight;
      totalQuantity += item.quantity;
    });

    const tender = new Tender({
      ...req.body,
      materials,
      totalWeight,
      totalQuantity,
      createdBy: req.user.id,
    });

    await tender.save();
    res.status(201).json({ success: true, data: tender });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const getTenderQuotations = async (req, res) => {
  try {
    const tender = await Tender.findById(req.params.id).populate("quotations");
    if (!tender)
      return res
        .status(404)
        .json({ success: false, message: "Tender not found" });
    res.status(200).json({ success: true, quotations: tender.quotations });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const finalizeTender = async (req, res) => {
  try {
    const { quotationId, finalPrice } = req.body;
    const tender = await Tender.findById(req.params.id);
    if (!tender)
      return res
        .status(404)
        .json({ success: false, message: "Tender not found" });
    if (tender.createdBy.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }
    const quotation = await Quotation.findOne({
      _id: quotationId,
      tender: tender._id,
    });
    if (!quotation)
      return res
        .status(400)
        .json({ success: false, message: "Invalid quotation" });
    tender.selectedQuotation = quotation._id;
    tender.finalPrice = finalPrice;
    tender.status = "finalized";
    await tender.save();
    res
      .status(200)
      .json({ success: true, message: "Tender finalized", tender });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};
