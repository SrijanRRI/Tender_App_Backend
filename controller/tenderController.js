import Tender from "../models/tenderSchema.js";
import Quotation from "../models/quotationSchema.js";
import { generateSignedUrl } from "../utils/minioClient.js";
import mongoose from "mongoose";
import User from "../models/userSchema.js"; // Replace with your actual user model path
import { sendMail } from "../utils/sendMail.js"; // You must have this utility created
import userModel from "../models/userSchema.js";
// ✅ Create Tender with bidding window + delivery window
import moment from "moment-timezone";
import { sendWhatsAppTemplate } from "../utils/sendWhatsapp.js";

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
      projectRemark,
      // maxBidAmount,
      // maxBidUnit,
    } = req.body;

    console.log("Received Bidding Start (Local):", biddingStart);
    console.log("Received Bidding End (Local):", biddingEnd);

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

    // if (
    //   maxBidAmount === undefined ||
    //   isNaN(maxBidAmount) ||
    //   Number(maxBidAmount) < 0
    // ) {
    //   return res.status(400).json({
    //     success: false,
    //     message: "Valid max bid amount is required and must be non-negative",
    //   });
    // }

    // if (!maxBidUnit || !["Per MT", "Per Tender"].includes(maxBidUnit)) {
    //   return res.status(400).json({
    //     success: false,
    //     message: "Valid max bid unit is required (Per MT or Per Tender)",
    //   });
    // }

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

    // 🌐 Convert all date/time inputs from 'Asia/Kolkata' to UTC
    const timezone = "Asia/Kolkata";
    const utcBiddingStart = moment.tz(biddingStart, timezone).utc().toDate();
    const utcBiddingEnd = moment.tz(biddingEnd, timezone).utc().toDate();
    const utcDeliveryFrom = moment
      .tz(deliveryWindow.from, timezone)
      .utc()
      .toDate();
    const utcDeliveryTo = moment.tz(deliveryWindow.to, timezone).utc().toDate();
    let utcCloseDate = null;
    if (closeDate) {
      const [year, month, day] = closeDate.split("-").map(Number);
      utcCloseDate = new Date(Date.UTC(year, month - 1, day));
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
      closeDate: utcCloseDate,
      biddingStart: utcBiddingStart,
      biddingEnd: utcBiddingEnd,
      deliveryWindow: {
        from: utcDeliveryFrom,
        to: utcDeliveryTo,
      },
      totalWeight,
      totalQuantity,
      projectName,
      projectCode,
      purchaseOrder,
      projectRemark: projectRemark || "",
      // maxBidAmount,
      // maxBidUnit,
    });

    await tender.save();

    // 📨 Notify transporters
    const transporterUsers = await User.find({
      _id: { $in: transporters.map((id) => new mongoose.Types.ObjectId(id)) },
    });

    for (const user of transporterUsers) {
      if (!user.phone) {
        console.warn(
          `⚠️ Skipping user without phone: ${user.name || user._id}`
        );
        continue; // Skip to the next user
      }
      const values = {
        dispatch_location: dispatchLocation,
        delivery_from: moment(utcDeliveryFrom)
          .tz(timezone)
          .format("DD MMM YYYY"),
        delivery_to: moment(utcDeliveryTo).tz(timezone).format("DD MMM YYYY"),
        start_datetime: moment(utcBiddingStart)
          .tz(timezone)
          .format("DD MMM YYYY, hh:mm A"),
        end_datetime: moment(utcBiddingEnd)
          .tz(timezone)
          .format("DD MMM YYYY, hh:mm A"),
      };

      await sendWhatsAppTemplate(user.phone, values);
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
    console.log(finalPrice);

    // 🔎 Find tender
    const tender = await Tender.findById(req.params.id);
    if (!tender) {
      return res
        .status(404)
        .json({ success: false, message: "Tender not found" });
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

    // 🔎 Find quotation
    const quotation = await Quotation.findOne({
      _id: quotationId,
      tender: tender._id,
    });
    if (!quotation) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid quotation" });
    }

    // 🔎 Find transport user
    const transportUser = await userModel.findById(quotation.transportUser);
    if (!transportUser) {
      return res
        .status(400)
        .json({ success: false, message: "Transport user not found" });
    }

    // ✅ Update tender with finalization
    tender.selectedQuotation = quotation._id;
    tender.finalTransporter = quotation.transportUser;
    tender.finalPrice = finalPrice;
    tender.status = "finalized";
    await tender.save();

    // ✅ Email Notification to Transport User
    try {
      await sendMail({
        to: transportUser.email,
        subject:
          "🎉 Congratulations! Your Quotation Has Been Accepted - RR ISPAT",
        html: `
          <div style="margin:0; padding:0; background-color:#f4f4f4;">
            <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:620px; background:#ffffff; margin-top:30px; margin-bottom:30px; border-radius:10px; overflow:hidden; box-shadow: 0 6px 20px rgba(0,0,0,0.15);">
              
              <tr>
                <td align="center" style="background: #ffffff; padding: 30px;">
                  <div style="font-family: Arial, sans-serif; font-size: 28px; font-weight: bold;">
                    <span style="color: #e74c3c;">RR</span> <span style="color: #000;">ISPAT</span>
                  </div>
                  <div style="font-family: Arial, sans-serif; font-size: 13px; margin-top: 5px; color: #777;">
                    A Unit of Godawari Power and Ispat Limited
                  </div>
                </td>
              </tr>

              <tr>
                <td style="padding: 40px 30px; font-family: Arial, sans-serif; color: #333; font-size: 16px;">

                  <p>Hello <strong>${transportUser.name}</strong>,</p>

                  <p style="margin-top:20px;">
                    🎉 <strong>Congratulations!</strong> Your quotation has been <span style="color: #2E86C1;">ACCEPTED</span> for the following journey:
                  </p>

                  <table cellpadding="5" cellspacing="0" width="100%" style="margin: 20px 0;">
                    <tr>
                      <td style="font-weight:bold;">📍 Dispatch Location:</td>
                      <td>${tender.dispatchLocation}</td>
                    </tr>
                    <tr>
                      <td style="font-weight:bold;">🚚 Delivery Window:</td>
                      <td>${moment(tender.deliveryWindow.from)
                        .tz("Asia/Kolkata")
                        .format("DD MMM YYYY")} to ${moment(
          tender.deliveryWindow.to
        )
          .tz("Asia/Kolkata")
          .format("DD MMM YYYY")}</td>
                    </tr>
                  </table>

                  <p style="margin-top:30px;"><strong>📦 Tender Items:</strong></p>
                  <ul style="margin-top:10px; padding-left:20px;">
                    ${tender.materials
                      .map(
                        (mat) => `
                      <li>${mat.material} (${mat.subMaterial || "N/A"}) - ${
                          mat.weight
                        } MT, ${mat.quantity} Qty</li>
                    `
                      )
                      .join("")}
                  </ul>

                  <p style="margin-top:30px;">
                    <strong>✅ Finalized Price:</strong> ₹${finalPrice}
                  </p>

                  <p style="margin-top:30px;">
                    We sincerely appreciate your cooperation. Further communication regarding dispatch schedules will follow shortly.
                  </p>

                  <p style="margin-top:40px;">
                    Thanks & Regards,<br>
                    <span style="font-weight:bold; font-size:18px;">RR ISPAT</span><br>
                    <small style="color:#777;">A Unit of Godawari Power and Ispat Limited</small>
                  </p>

                </td>
              </tr>

              <tr>
                <td style="background-color: #f1f1f1; text-align: center; padding: 15px; font-size: 12px; color: #777;">
                  Building Strong Foundations | <a href="https://www.rrispat.com" style="color: #2E86C1; text-decoration: none;">www.rrispat.com</a>
                </td>
              </tr>

            </table>
          </div>
        `,
      });
    } catch (emailErr) {
      console.error("Failed to send finalization email:", emailErr.message);
    }

    res.status(200).json({
      success: true,
      message: "Tender finalized and email sent to transport user",
      tender,
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
      biddingEnd: { $gte: now },
    }).sort({ createdAt: -1 });

    const tenderIds = tenders.map((t) => t._id);

    // Step 2: Get all quotations by this transporter for these tenders
    const transporterQuotations = await Quotation.find({
      transportUser: transporterId,
      tender: { $in: tenderIds },
    }).select("tender");

    const quotedTenderIds = new Set(
      transporterQuotations.map((q) => q.tender.toString())
    );

    // Count how many times transporter quoted per tender
    const bidCountMap = {};
    transporterQuotations.forEach((q) => {
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

//upcomming tender

export const getUpcomingTendersForTransporter = async (req, res) => {
  try {
    const transporterId = req.user.id;
    const now = new Date();

    // 🟡 Step 1: Find upcoming tenders assigned to this transporter
    const upcomingTenders = await Tender.find({
      transporters: transporterId,
      status: "open",
      biddingStart: { $gt: now },
    })
      .sort({ biddingStart: 1 })
      .populate("createdBy", "name email");

    // 🕒 Step 2: Add biddingOpensIn to each tender
    const tendersWithCountdown = upcomingTenders.map((tender) => {
      const tenderObj = tender.toObject();
      tenderObj.biddingOpensIn =
        new Date(tender.biddingStart).getTime() - now.getTime(); // in milliseconds
      return tenderObj;
    });

    res.status(200).json({ success: true, data: tendersWithCountdown });
  } catch (error) {
    console.error("Error in getUpcomingTendersForTransporter:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ 5. Get Quotations for a Tender

export const getTenderQuotations = async (req, res) => {
  try {
    const tenderId = req.params.id;
    const userId = req.user.id;

    const tender = await Tender.findById(tenderId).populate(
      "createdBy",
      "name email"
    );
    if (!tender) {
      return res
        .status(404)
        .json({ success: false, message: "Tender not found" });
    }

    if (tender.createdBy._id.toString() !== userId) {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    const now = new Date();
    if (now < tender.biddingEnd) {
      return res.status(403).json({
        success: false,
        message:
          "Top quotations can be viewed only after the bidding window closes.",
      });
    }

    const allQuotes = await Quotation.find({ tender: tenderId })
      .populate("transportUser", "name email")
      .sort({ price: 1, createdAt: 1 });

    const seen = new Set();
    const bestQuotes = [];

    for (const q of allQuotes) {
      const uid = q.transportUser._id.toString();
      if (!seen.has(uid)) {
        seen.add(uid);
        bestQuotes.push(q);
      }
    }

    let quotesToReturn = [];
    if (tender.reopenCount === 0) {
      quotesToReturn = bestQuotes.slice(0, 3); // L1, L2, L3
    } else if (tender.reopenCount === 1) {
      quotesToReturn = bestQuotes.slice(1, 3); // L2, L3
    } else if (tender.reopenCount === 2) {
      quotesToReturn = bestQuotes.slice(2, 3); // Only L3
    }

    const ranked = quotesToReturn.map((q, index) => {
      const signedFiles = (q.files || []).map((file) => {
        const key = file.url?.split("/").pop();
        return { ...file, url: generateSignedUrl(key) };
      });

      return {
        rank: `L${bestQuotes.indexOf(q) + 1}`,
        transportUser: q.transportUser,
        price: q.price,
        vehicleNumber: q.vehicleNumber,
        createdAt: q.createdAt,
        files: signedFiles,
        _id: q._id,
      };
    });

    res.status(200).json({ success: true, data: ranked });
  } catch (error) {
    console.error("Error fetching top 3 quotations:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

//reopen tender
export const reopenTender = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || reason.trim() === "") {
      return res.status(400).json({ error: "Reason is required." });
    }

    const tender = await Tender.findById(id);
    if (!tender)
      return res.status(404).json({ success: false, message: "Not found" });

    // 🚫 Prevent reopening more than twice
    if (tender.reopenCount >= 2) {
      return res.status(403).json({
        success: false,
        message:
          "This tender has already been reopened twice and cannot be reopened again.",
      });
    }

    // ✅ Perform reopen
    tender.status = "open";
    tender.selectedQuotation = null;
    tender.finalTransporter = null;
    tender.finalPrice = null;
    tender.reopenCount = (tender.reopenCount || 0) + 1; // ✅ increment counter
    tender.winnerComment = `[Reopened: ${reason}]`;

    await tender.save();

    res.status(200).json({
      success: true,
      message: "Tender reopened successfully",
      reopenCount: tender.reopenCount,
    });
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

    const today = new Date();
    today.setHours(0, 0, 0, 0); // normalize to start of today

    // ✅ Get all quotations by this transporter, grouped by tender
    const quotations = await Quotation.find({ transportUser: transporterId })
      .populate({
        path: "tender",
        populate: {
          path: "createdBy",
          select: "name email",
        },
      })
      .sort({ createdAt: 1 });

    const tenderQuotesMap = new Map();

    // ✅ Group quotations by tender ID (and skip tenders whose closeDate >= today)
    for (const q of quotations) {
      const tender = q.tender;
      const tenderId = tender?._id?.toString();
      if (!tenderId) continue;

      const biddingEndTime = new Date(tender.biddingEnd);
      if (biddingEndTime > new Date()) continue;

      if (!tenderQuotesMap.has(tenderId)) {
        tenderQuotesMap.set(tenderId, []);
      }
      tenderQuotesMap.get(tenderId).push(q);
    }

    const result = [];

    for (const [tenderId, tenderQuotes] of tenderQuotesMap.entries()) {
      const tender = tenderQuotes[0].tender;

      // ✅ Determine if any of the quotations match the selectedQuotation
      const isSelected =
        tender.selectedQuotation &&
        tenderQuotes.some(
          (q) => q._id.toString() === tender.selectedQuotation.toString()
        );

      const formattedQuotes = tenderQuotes.map((q) => {
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
          files: signedFiles,
        };
      });

      result.push({
        tenderId: tender._id,
        tender: {
          dispatchLocation: tender.dispatchLocation,
          address: tender.address,
          deliveryWindow: tender.deliveryWindow || { from: null, to: null },
          closeDate: tender.closeDate,
          status: tender.status,
          remarks: tender.remarks,
          materials: tender.materials || [],
          totalWeight: tender.totalWeight,
          totalQuantity: tender.totalQuantity,
          createdBy: tender.createdBy || null,
          maxBidAmount: tender.maxBidAmount,
          maxBidUnit: tender.maxBidUnit || null,
          finalizedStatus: isSelected
            ? "Your quotation was finalized"
            : "Your quotation was not selected",
        },
        quotations: formattedQuotes,
      });
    }

    res.status(200).json({
      success: true,
      data: result,
    });
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
    const { tenderId } = req.params;
    const userId = req.user.id;

    console.log("Fetching position for tenderId:", tenderId);

    // ✅ Validate Tender ID
    if (!tenderId || !mongoose.Types.ObjectId.isValid(tenderId)) {
      return res.status(400).json({ message: "Invalid or missing Tender ID" });
    }

    // ✅ Get all quotations for the tender, sorted by price + createdAt
    const allQuotes = await Quotation.find({ tender: tenderId }).sort({
      price: 1,
      createdAt: 1,
    });

    // ✅ Group best (lowest) quote per transporter
    const bestQuotesMap = new Map(); // transportUserId => bestQuotation

    for (const quote of allQuotes) {
      const uid = quote.transportUser.toString();
      if (!bestQuotesMap.has(uid)) {
        bestQuotesMap.set(uid, quote); // first lowest quote per transporter
      }
    }

    // ✅ Sort those best quotes by price (and createdAt to break ties)
    const sortedBestQuotes = Array.from(bestQuotesMap.entries()).sort(
      ([, q1], [, q2]) => {
        if (q1.price === q2.price) {
          return new Date(q1.createdAt) - new Date(q2.createdAt);
        }
        return q1.price - q2.price;
      }
    );

    // ✅ Find current user's rank + their best quote
    let position = null;
    let bestQuote = null;

    for (let i = 0; i < sortedBestQuotes.length; i++) {
      const [uid, quote] = sortedBestQuotes[i];
      if (uid === userId) {
        position = `L${i + 1}`;
        bestQuote = {
          _id: quote._id,
          price: quote.price,
          vehicleNumber: quote.vehicleNumber,
          createdAt: quote.createdAt,
        };
        break;
      }
    }

    // ✅ No bids yet?
    if (!bestQuote) {
      return res.status(200).json({
        position: null,
        message: "You have not submitted any bids yet.",
      });
    }

    // ✅ Success response with rank + best bid
    res.status(200).json({
      position,
      bestQuotation: bestQuote,
    });
  } catch (error) {
    console.error("Error getting bid position:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
