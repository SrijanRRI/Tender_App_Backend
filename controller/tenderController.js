import Tender from "../models/tenderSchema.js";
import Quotation from "../models/quotationSchema.js";
import { generateSignedUrl } from "../utils/minioClient.js";

// ✅ 1. Create Tender

export const createTender = async (req, res) => {
  try {
    const { materials, transporters, remarks, closeDate } = req.body;
    console.log(req.body);
    
    if (!materials || !Array.isArray(materials) || materials.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one material entry is required",
      });
    }

    let totalWeight = 0;
    let totalQuantity = 0;

    // Ensure subMaterial is always present (even if empty)
    const normalizedMaterials = materials.map((item) => {
      totalWeight += item.weight;
      totalQuantity += item.quantity;

      return {
        material: item.material,
        subMaterial: item.subMaterial || "", // ✅ default if missing
        weight: item.weight,
        quantity: item.quantity,
      };
    });

    const tender = new Tender({
      ...req.body,
      createdBy: req.user.id,
      materials: normalizedMaterials,
      totalWeight,
      totalQuantity,
      transporters,
      remarks: remarks || "",
      closeDate,
    });

    await tender.save();
    res.status(201).json({ success: true, data: tender });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// ✅ 2. Finalize Tender
export const finalizeTender = async (req, res) => {
  try {
    const { quotationId, finalPrice } = req.body;

    const tender = await Tender.findById(req.params.id);
    if (!tender)
      return res.status(404).json({ success: false, message: "Tender not found" });

    if (tender.createdBy.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    const quotation = await Quotation.findOne({
      _id: quotationId,
      tender: tender._id,
    });

    if (!quotation)
      return res.status(400).json({ success: false, message: "Invalid quotation" });

    tender.selectedQuotation = quotation._id;
    tender.finalPrice = finalPrice;
    tender.status = "finalized";

    await tender.save();

    res.status(200).json({ success: true, message: "Tender finalized", tender });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// ✅ 3. Get All Tenders Created by RR User
export const getAllTendersByRRUser = async (req, res) => {
  try {
    const tenders = await Tender.find({ createdBy: req.user.id })
      .sort({ createdAt: -1 })
      .populate("selectedQuotation");

    res.status(200).json({ success: true, data: tenders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ 4. Get Tenders Assigned to a Transporter
export const getTendersForTransporter = async (req, res) => {
  try {
    const tenders = await Tender.find({
      transporters: req.user.id,
      status: "open",
    })
      .sort({ createdAt: -1 })
      .populate("createdBy", "name email");

    res.status(200).json({ success: true, data: tenders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ 5. Get Quotations for a Tender
export const getTenderQuotations = async (req, res) => {
  try {
    const tender = await Tender.findById(req.params.id)
      .populate("quotations");

    if (!tender) {
      return res.status(404).json({ success: false, message: "Tender not found" });
    }

    // Map through quotations and attach signed file URLs
    const quotationsWithSignedFiles = tender.quotations.map((quotation) => {
      const signedFiles = (quotation.files || []).map((file) => {
        const key = file.url?.split("/").pop(); // or file.key if you store just the filename
        return {
          ...file,
          url: generateSignedUrl(key),
        };
      });

      return {
        ...quotation.toObject(),
        files: signedFiles,
      };
    });

    res.status(200).json({ success: true, quotations: quotationsWithSignedFiles });

  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// ✅ 6. Get Single Tender
export const getSingleTender = async (req, res) => {
  try {
    const tender = await Tender.findById(req.params.id)
      .populate("createdBy", "name email")
      .populate("quotations")
      .populate("selectedQuotation");

    if (!tender) {
      return res.status(404).json({ success: false, message: "Tender not found" });
    }

    res.status(200).json({ success: true, data: tender });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// ✅ 7. Delete Tender (by RR User)
export const deleteTender = async (req, res) => {
  try {
    const tender = await Tender.findById(req.params.id);

    if (!tender) {
      return res.status(404).json({ success: false, message: "Tender not found" });
    }

    if (tender.createdBy.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    await Tender.findByIdAndDelete(req.params.id);

    res.status(200).json({ success: true, message: "Tender deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
