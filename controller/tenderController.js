import Tender from "../models/tenderSchema.js";
import Quotation from "../models/quotationSchema.js";
import { generateSignedUrl } from "../utils/minioClient.js";
import mongoose from "mongoose";
import User from "../models/userSchema.js"; // Replace with your actual user model path
import { sendMail } from "../utils/sendMail.js"; // You must have this utility created

//Create Tender

export const createTender = async (req, res) => {
  try {
    const {
      materials,
      transporters,
      remarks,
      closeDate,
      deliveryWindow,
      totalWeight,
      totalQuantity,
      projectName,
      projectCode,
      purchaseOrder,
      projectRemark,
    } = req.body;

    if (!projectName || !projectCode || !purchaseOrder) {
      return res.status(400).json({
        success: false,
        message: "Project name and code are required",
      });
    }

    // ✅ Validate delivery window
    if (
      !deliveryWindow ||
      !deliveryWindow.from ||
      !deliveryWindow.to ||
      isNaN(Date.parse(deliveryWindow.from)) ||
      isNaN(Date.parse(deliveryWindow.to))
    ) {
      return res.status(400).json({
        success: false,
        message: "A valid delivery date range is required",
      });
    }

    // ✅ Validate materials
    if (!materials || !Array.isArray(materials) || materials.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one material entry is required",
      });
    }

    // ✅ Normalize material fields
    const normalizedMaterials = materials.map((item) => {
      return {
        material: item.material,
        subMaterial: item.subMaterial || "",
        weight: item.weight,
        quantity: item.quantity,
      };
    });

    // ✅ Create Tender
    const tender = new Tender({
      ...req.body,
      createdBy: req.user.id,
      materials: normalizedMaterials,
      totalWeight,
      totalQuantity,
      transporters,
      remarks: remarks || "",
      deliveryWindow: {
        from: new Date(deliveryWindow.from),
        to: new Date(deliveryWindow.to),
      },
      closeDate,
      projectName,
      projectCode,
      purchaseOrder,
      projectRemark: projectRemark || "",

    });
    console.log(tender);

    await tender.save();

    // ✅ Fetch transporter emails
    const transporterUsers = await User.find({
      _id: { $in: transporters.map((id) => new mongoose.Types.ObjectId(id)) },
    });

    const transporterEmails = transporterUsers.map((user) => user.email);

    // ✅ Prepare email content
    const subject = "📦 New Tender Assigned to You - RR ISPAT";

    const htmlBody = `
      <h2>New Tender Assigned</h2>
      <p><strong>Dispatch Location:</strong> ${tender.dispatchLocation}</p>
      <p><strong>Address:</strong> ${tender.address}</p>
      <p><strong>Delivery Window:</strong> ${new Date(
        tender.deliveryWindow.from
      ).toLocaleDateString()} - ${new Date(
      tender.deliveryWindow.to
    ).toLocaleDateString()}</p>
      <p><strong>Close Date:</strong> ${new Date(
        tender.closeDate
      ).toLocaleDateString()}</p>
      <h4>Materials</h4>
     <ul>
  ${tender.materials
    .map((mat) => {
      let line = `${mat.material}`; // always include material

      if (mat.subMaterial) {
        line += ` (${mat.subMaterial})`;
      }

      const weightDisplay =
        mat.weight && !isNaN(mat.weight) ? `${mat.weight}kg` : "";
      const qtyDisplay =
        mat.quantity && !isNaN(mat.quantity) ? `× ${mat.quantity} pcs` : "";

      const detailLine = [weightDisplay, qtyDisplay].filter(Boolean).join(" ");

      if (detailLine) {
        line += ` - ${detailLine}`;
      }

      return `<li>${line}</li>`;
    })
    .join("")}
</ul>
      <p><strong>Remarks:</strong> ${tender.remarks || "None"}</p>
      <br/>
      <p>📝 Please log in to the Transporter Dashboard to submit your quotation.</p>
    `;

    // ✅ Send emails
    for (const email of transporterEmails) {
      try {
        await sendMail({
          to: email,
          subject,
          html: htmlBody,
        });
        console.log(`Email sent to ${email}`);
      } catch (emailError) {
        console.error(`Failed to send email to ${email}:`, emailError.message);
      }
    }

    res.status(201).json({ success: true, data: tender });
  } catch (error) {
    console.error("Error creating tender:", error);
    res.status(400).json({ success: false, message: error.message });
  }
};

// ✅ 2. Finalize Tender
export const finalizeTender = async (req, res) => {
  try {
    const { quotationId, finalPrice } = req.body;

    const tender = await Tender.findById(req.params.id);
    if (!tender) {
      return res
        .status(404)
        .json({ success: false, message: "Tender not found" });
    }

    // ✅ Prevent re-finalization
    if (tender.status === "finalized" || tender.selectedQuotation) {
      return res.status(400).json({
        success: false,
        message: "Tender has already been finalized and cannot be changed.",
      });
    }

    if (tender.createdBy.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    const quotation = await Quotation.findOne({
      _id: quotationId,
      tender: tender._id,
    });

    if (!quotation) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid quotation" });
    }

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

// ✅ 4. Get Tenders Assigned to a Transporter (excluding already quoted ones)
export const getTendersForTransporter = async (req, res) => {
  try {
    const transporterId = req.user.id;

    // Step 1: Get all tenders assigned to this transporter and that are still open
    const tenders = await Tender.find({
      transporters: transporterId,
      status: "open",
    }).sort({ createdAt: -1 });

    // Step 2: Get quotations submitted by the transporter
    const transporterQuotations = await Quotation.find({
      transportUser: transporterId,
    }).select("tender");

    const quotedTenderIds = new Set(
      transporterQuotations.map((q) => q.tender.toString())
    );

    // Step 3: Fetch all quotations for these tenders
    const tenderIds = tenders.map(t => t._id);
    const allQuotations = await Quotation.find({
      tender: { $in: tenderIds }
    }).populate("transportUser", "name email");

    // Group quotations by tender ID
    const quotationsByTender = {};
    for (const q of allQuotations) {
      const tid = q.tender.toString();
      if (!quotationsByTender[tid]) quotationsByTender[tid] = [];
      quotationsByTender[tid].push({
        _id: q._id,
        transportUser: q.transportUser,
      });
    }

    // Step 4: Attach hasQuoted flag and quotations[]
    const tendersWithQuoteStatus = tenders.map((tender) => {
      const tenderObj = tender.toObject();
      tenderObj.hasQuoted = quotedTenderIds.has(tender._id.toString());
      tenderObj.quotations = quotationsByTender[tender._id.toString()] || [];
      return tenderObj;
    });

    // Step 5: Populate createdBy field
    await Tender.populate(tendersWithQuoteStatus, {
      path: "createdBy",
      select: "name email",
    });

    res.status(200).json({ success: true, data: tendersWithQuoteStatus });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ 5. Get Quotations for a Tender
export const getTenderQuotations = async (req, res) => {
  try {
    const tender = await Tender.findById(req.params.id).populate("quotations");

    if (!tender) {
      return res
        .status(404)
        .json({ success: false, message: "Tender not found" });
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

    res
      .status(200)
      .json({ success: true, quotations: quotationsWithSignedFiles });
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
      return res
        .status(404)
        .json({ success: false, message: "Tender not found" });
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
      return res
        .status(404)
        .json({ success: false, message: "Tender not found" });
    }

    if (tender.createdBy.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    await Tender.findByIdAndDelete(req.params.id);

    res
      .status(200)
      .json({ success: true, message: "Tender deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ Get Quotation History for Transporter

export const getQuotationHistoryForTransporter = async (req, res) => {
  try {
    const transporterId = new mongoose.Types.ObjectId(req.user.id);

    // ✅ Get all quotations by this transporter, populate tender + its creator
    const quotations = await Quotation.find({ transportUser: transporterId })
      .populate({
        path: "tender",
        populate: {
          path: "createdBy",
          select: "name email",
        },
      })
      .sort({ createdAt: -1 });

    const formatted = quotations.map((q) => {
      const signedFiles = (q.files || []).map((file) => {
        const key = file.url?.split("/").pop();
        return {
          ...file,
          url: generateSignedUrl(key),
        };
      });

      const isSelected =
        q.tender?.selectedQuotation?.toString() === q._id.toString();

      return {
        _id: q._id,
        tenderId: q.tender?._id,
        price: q.price,
        vehicleNumber: q.vehicleNumber,
        files: signedFiles,
        createdAt: q.createdAt,
        selected: isSelected,
        tender: {
          _id: q.tender?._id,
          dispatchLocation: q.tender?.dispatchLocation,
          address: q.tender?.address,
          deliveryWindow: q.tender?.deliveryWindow || { from: null, to: null },
          closeDate: q.tender?.closeDate,
          status: q.tender?.status,
          finalPrice: q.tender?.finalPrice,
          remarks: q.tender?.remarks,
          materials: q.tender?.materials || [],
          totalWeight: q.tender?.totalWeight,
          totalQuantity: q.tender?.totalQuantity,
          createdBy: q.tender?.createdBy || null, // ✅ now includes name, email, and _id
        },
      };
    });

    res.status(200).json({ success: true, data: formatted });
  } catch (error) {
    console.error("Error fetching quotation history:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

//all finalized tenders

export const getAllFinalizedTendersWithQuotations = async (req, res) => {
  try {
    const rrUserId = req.user.id;

    // ✅ Get all finalized tenders created by this RR user
    const finalizedTenders = await Tender.find({
      createdBy: rrUserId,
      status: "finalized",
    })
      .populate({
        path: "selectedQuotation",
        populate: { path: "transportUser", select: "name email" },
      })
      .populate("createdBy", "name email")
      .sort({ updatedAt: -1 });

    const results = [];

    for (const tender of finalizedTenders) {
      // ✅ Get all quotations for this tender
      const quotations = await Quotation.find({ tender: tender._id })
        .populate("transportUser", "name email")
        .sort({ createdAt: -1 });

      const allQuotations = quotations.map((q) => {
        const signedFiles = (q.files || []).map((file) => {
          const key = file.url?.split("/").pop();
          return {
            ...file,
            url: generateSignedUrl(key),
          };
        });

        return {
          _id: q._id,
          price: q.price,
          vehicleNumber: q.vehicleNumber,
          createdAt: q.createdAt,
          transportUser: q.transportUser,
          files: signedFiles,
        };
      });

      const selectedQuotationId = tender.selectedQuotation?._id?.toString();

      results.push({
        tender: {
          _id: tender._id,
          dispatchLocation: tender.dispatchLocation,
          address: tender.address,
          deliveryWindow: tender.deliveryWindow, // ✅ Updated from dateOfDelivery
          closeDate: tender.closeDate,
          remarks: tender.remarks,
          status: tender.status,
          finalPrice: tender.finalPrice,
          materials: tender.materials,
          totalWeight: tender.totalWeight,
          totalQuantity: tender.totalQuantity,
          createdBy: tender.createdBy,
        },
        selectedQuotation: tender.selectedQuotation
          ? {
              _id: tender.selectedQuotation._id,
              price: tender.selectedQuotation.price,
              vehicleNumber: tender.selectedQuotation.vehicleNumber,
              transportUser: tender.selectedQuotation.transportUser,
              files: (tender.selectedQuotation.files || []).map((file) => {
                const key = file.url?.split("/").pop();
                return {
                  ...file,
                  url: generateSignedUrl(key),
                };
              }),
            }
          : null,
        allQuotations: allQuotations.map((q) => ({
          ...q,
          selected: q._id.toString() === selectedQuotationId,
        })),
      });
    }

    res.status(200).json({ success: true, data: results });
  } catch (error) {
    console.error("Error fetching finalized tenders for RR user:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};
