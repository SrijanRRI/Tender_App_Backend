import Tender from "../models/tenderSchema.js";
import Quotation from "../models/quotationSchema.js";
import { generateSignedUrl } from "../utils/minioClient.js";
import mongoose from "mongoose";
import User from "../models/userSchema.js"; // Replace with your actual user model path
import { sendMail } from "../utils/sendMail.js"; // You must have this utility created
import userModel from "../models/userSchema.js";


// ✅ Create Tender with bidding window + delivery window
export const createTender = async (req, res) => {
  try {
    const {
      dispatchLocation,
      address,
      pincode,
      materials,
      transporters,
      remarks,
      closeDate,
      deliveryWindow,
      biddingStart,
      biddingEnd,
      totalWeight,
      totalQuantity,
      projectName,
      projectCode,
      purchaseOrder,
      projectRemark
    } = req.body;

    // 🔐 Basic validations
    if (!projectName || !projectCode || !purchaseOrder) {
      return res.status(400).json({
        success: false,
        message: "Project name, code and PO are required",
      });
    }

    if (!biddingStart || !biddingEnd) {
      return res.status(400).json({
        success: false,
        message: "Bidding start and end time are required",
      });
    }

    if (!deliveryWindow?.from || !deliveryWindow?.to) {
      return res.status(400).json({
        success: false,
        message: "Delivery window (from and to dates) is required",
      });
    }

    if (!materials || !Array.isArray(materials) || materials.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one material entry is required",
      });
    }

    const normalizedMaterials = materials.map((mat) => ({
      material: mat.material,
      subMaterial: mat.subMaterial || "",
      weight: mat.weight,
      quantity: mat.quantity,
    }));

    const tender = new Tender({
      createdBy: req.user.id,
      dispatchLocation,
      address,
      pincode,
      materials: normalizedMaterials,
      transporters,
      remarks: remarks || "",
      closeDate,
      biddingStart: new Date(biddingStart),
      biddingEnd: new Date(biddingEnd),
      deliveryWindow: {
        from: new Date(deliveryWindow.from),
        to: new Date(deliveryWindow.to),
      },
      totalWeight,
      totalQuantity,
      projectName,
      projectCode,
      purchaseOrder,
      projectRemark: projectRemark || ""
    });

    await tender.save();

    // 📨 Notify transporters
    const transporterUsers = await User.find({
      _id: { $in: transporters.map(id => new mongoose.Types.ObjectId(id)) },
    });

    const transporterEmails = transporterUsers.map((user) => user.email);
    const subject = "📦 New Tender Assigned - RR ISPAT";

    const htmlBody = `
      <h3>New Tender Assigned</h3>
      <p><strong>Dispatch Location:</strong> ${dispatchLocation}</p>
      <p><strong>Delivery Window:</strong> ${new Date(deliveryWindow.from).toLocaleDateString()} - ${new Date(deliveryWindow.to).toLocaleDateString()}</p>
      <p><strong>Bidding Ends:</strong> ${new Date(biddingEnd).toLocaleDateString()}</p>
      <p><strong>Remarks:</strong> ${remarks || "N/A"}</p>
      <p>Login to your Transporter Dashboard to place your bids.</p>
    `;

    for (const email of transporterEmails) {
      await sendMail({ to: email, subject, html: htmlBody });
    }

    res.status(201).json({ success: true, data: tender });
  } catch (error) {
    console.error("Tender creation failed:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};


// ✅ 2. Finalize Tender


export const finalizeTender = async (req, res) => {
  try {
    const { quotationId, finalPrice } = req.body;

    const tender = await Tender.findById(req.params.id);
    if (!tender) {
      return res.status(404).json({ success: false, message: "Tender not found" });
    }

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
      return res.status(400).json({ success: false, message: "Invalid quotation" });
    }

    const transportUser = await userModel.findById(quotation.transportUser);
    if (!transportUser) {
      return res.status(400).json({ success: false, message: "Transport user not found" });
    }

    // ✅ Update tender with all finalization details
    tender.selectedQuotation = quotation._id;
    tender.finalTransporter = quotation.transportUser;
    tender.finalPrice = finalPrice;
    tender.status = "finalized";
    tender.winnerComment = `Manually finalized by ${req.user.name}`;
    await tender.save();

    // ✅ Email notification
    try {
      await sendMail({
        to: transportUser.email,
        subject: '🎉 Your Quotation Has Been Selected!',
        html: `
          <p>Hello <strong>${transportUser.name}</strong>,</p>
          <p>Great news! Your quotation for the tender <strong>#${tender._id}</strong> has been accepted.</p>
          <p><strong>Final Price:</strong> ₹${finalPrice}</p>
          <p>We appreciate your support. Further details will be communicated soon.</p>
          <br/>
          <p>Regards,<br/>RR ISPAT Team</p>
        `
      });
    } catch (emailErr) {
      console.error('Failed to send finalization email:', emailErr.message);
    }

    res.status(200).json({
      success: true,
      message: "Tender finalized and email sent to transport user",
      tender
    });

  } catch (error) {
    console.error("Error in finalizeTender:", error);
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
    const now = new Date();

    // Step 1: Get all open tenders assigned to this transporter and within bidding window
    const tenders = await Tender.find({
      transporters: transporterId,
      status: "open",
      biddingStart: { $lte: now },
      biddingEnd: { $gte: now }
    }).sort({ createdAt: -1 });

    const tenderIds = tenders.map(t => t._id);

    // Step 2: Get all quotations by this transporter for these tenders
    const transporterQuotations = await Quotation.find({
      transportUser: transporterId,
      tender: { $in: tenderIds }
    }).select("tender");

    const quotedTenderIds = new Set(transporterQuotations.map(q => q.tender.toString()));

    // Count how many times transporter quoted per tender
    const bidCountMap = {};
    transporterQuotations.forEach(q => {
      const id = q.tender.toString();
      bidCountMap[id] = (bidCountMap[id] || 0) + 1;
    });

    // Step 3: Prepare tender list with hasQuoted and bidsLeft
    const tendersWithStatus = tenders.map((tender) => {
      const tenderObj = tender.toObject();
      const tid = tender._id.toString();
      tenderObj.hasQuoted = quotedTenderIds.has(tid);
      tenderObj.bidsUsed = bidCountMap[tid] || 0;
      tenderObj.bidsRemaining = Math.max(0, 3 - tenderObj.bidsUsed);
      return tenderObj;
    });

    // Step 4: Populate createdBy field
    await Tender.populate(tendersWithStatus, {
      path: "createdBy",
      select: "name email",
    });

    res.status(200).json({ success: true, data: tendersWithStatus });
  } catch (error) {
    console.error("Error in getTendersForTransporter:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};


// ✅ 5. Get Quotations for a Tender

export const getTenderQuotations = async (req, res) => {
  try {
    const tenderId = req.params.id;
    const userId = req.user.id;

    const tender = await Tender.findById(tenderId).populate("createdBy", "name email");
    if (!tender) return res.status(404).json({ success: false, message: "Tender not found" });
    if (tender.createdBy._id.toString() !== userId)
      return res.status(403).json({ success: false, message: "Unauthorized" });

    const allQuotations = await Quotation.find({ tender: tenderId })
      .populate("transportUser", "name email")
      .sort({ price: 1, createdAt: 1 });

    // Step 1: Compute first (best) quote per transporter for ranking
    const bestQuotesMap = new Map(); // key: transportUserId => { quote, index }

    for (let i = 0; i < allQuotations.length; i++) {
      const q = allQuotations[i];
      const uid = q.transportUser._id.toString();
      if (!bestQuotesMap.has(uid)) {
        bestQuotesMap.set(uid, { quote: q, index: i });
      }
    }

    // Step 2: Assign ranks based on best quote positions
    const rankMap = {};
    Array.from(bestQuotesMap.entries())
      .sort((a, b) => a[1].index - b[1].index)
      .forEach(([uid], idx) => {
        rankMap[uid] = `L${idx + 1}`;
      });

    // Step 3: Group all quotes by transporter
    const grouped = {};
    for (const q of allQuotations) {
      const uid = q.transportUser._id.toString();
      const signedFiles = (q.files || []).map((file) => {
        const key = file.url?.split("/").pop();
        return { ...file, url: generateSignedUrl(key) };
      });

      if (!grouped[uid]) {
        grouped[uid] = {
          transportUser: q.transportUser,
          bidCount: 0,
          rank: rankMap[uid],
          finalPrice: bestQuotesMap.get(uid).quote.price,
          allBids: [],
        };
      }

      grouped[uid].bidCount += 1;
      grouped[uid].allBids.push({
        _id: q._id,
        price: q.price,
        vehicleNumber: q.vehicleNumber,
        createdAt: q.createdAt,
        files: signedFiles,
      });
    }

    res.status(200).json({ success: true, data: Object.values(grouped) });
  } catch (error) {
    console.error("Error in getTenderQuotations:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};


//reopen tender
export const reopenTender = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const tender = await Tender.findById(id);
    if (!tender) return res.status(404).json({ success: false, message: "Not found" });

    tender.status = "open";
    tender.selectedQuotation = null;
    tender.finalTransporter = null;
    tender.finalPrice = null;
    tender.winnerComment = (tender.winnerComment || "") + `\n[Reopened: ${reason}]`;
    await tender.save();

    res.status(200).json({ success: true, message: "Tender reopened successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
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

// export const getAllFinalizedTendersWithQuotations = async (req, res) => {
//   try {
//     const rrUserId = req.user.id;

//     // ✅ Get all finalized tenders created by this RR user
//     const finalizedTenders = await Tender.find({
//       createdBy: rrUserId,
//       status: "finalized",
//     })
//       .populate({
//         path: "selectedQuotation",
//         populate: { path: "transportUser", select: "name email" },
//       })
//       .populate("createdBy", "name email")
//       .sort({ updatedAt: -1 });

//     const results = [];

//     for (const tender of finalizedTenders) {
//       // ✅ Get all quotations for this tender
//       const quotations = await Quotation.find({ tender: tender._id })
//         .populate("transportUser", "name email")
//         .sort({ createdAt: -1 });

//       const allQuotations = quotations.map((q) => {
//         const signedFiles = (q.files || []).map((file) => {
//           const key = file.url?.split("/").pop();
//           return {
//             ...file,
//             url: generateSignedUrl(key),
//           };
//         });

//         return {
//           _id: q._id,
//           price: q.price,
//           vehicleNumber: q.vehicleNumber,
//           createdAt: q.createdAt,
//           transportUser: q.transportUser,
//           files: signedFiles,
//         };
//       });

//       const selectedQuotationId = tender.selectedQuotation?._id?.toString();

//       results.push({
//         tender: {
//           _id: tender._id,
//           dispatchLocation: tender.dispatchLocation,
//           address: tender.address,
//           deliveryWindow: tender.deliveryWindow, // ✅ Updated from dateOfDelivery
//           closeDate: tender.closeDate,
//           remarks: tender.remarks,
//           status: tender.status,
//           finalPrice: tender.finalPrice,
//           materials: tender.materials,
//           totalWeight: tender.totalWeight,
//           totalQuantity: tender.totalQuantity,
//           createdBy: tender.createdBy,
//         },
//         selectedQuotation: tender.selectedQuotation
//           ? {
//               _id: tender.selectedQuotation._id,
//               price: tender.selectedQuotation.price,
//               vehicleNumber: tender.selectedQuotation.vehicleNumber,
//               transportUser: tender.selectedQuotation.transportUser,
//               files: (tender.selectedQuotation.files || []).map((file) => {
//                 const key = file.url?.split("/").pop();
//                 return {
//                   ...file,
//                   url: generateSignedUrl(key),
//                 };
//               }),
//             }
//           : null,
//         allQuotations: allQuotations.map((q) => ({
//           ...q,
//           selected: q._id.toString() === selectedQuotationId,
//         })),
//       });
//     }

//     res.status(200).json({ success: true, data: results });
//   } catch (error) {
//     console.error("Error fetching finalized tenders for RR user:", error);
//     res.status(500).json({ success: false, message: error.message });
//   }
// };


//your position for transporters 


export const getMyQuotationPosition = async (req, res) => {
  try {
    const { tenderId } = req.query;
    const userId = req.user.id;

    if (!tenderId) {
      return res.status(400).json({ message: "Tender ID is required" });
    }

    const allQuotes = await Quotation.find({ tender: tenderId }).sort({ price: 1, createdAt: 1 });

    // Prepare position list: only 1st bid per unique transporter
    const seen = new Set();
    const positionList = [];

    for (let quote of allQuotes) {
      const uid = quote.transportUser.toString();
      if (!seen.has(uid)) {
        seen.add(uid);
        positionList.push(uid);
      }
    }

    const index = positionList.indexOf(userId);
    if (index === -1) {
      return res.status(200).json({ position: null, message: "You have not submitted any bids yet." });
    }

    res.status(200).json({ position: `L${index + 1}` });
  } catch (error) {
    console.error("Error getting bid position:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
