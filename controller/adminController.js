import userModel from "../models/userSchema.js";
import Tender from "../models/tenderSchema.js";
import nodemailer from "nodemailer";
import Quotation from "../models/quotationSchema.js";
import { generateSignedUrl } from "../utils/minioClient.js";

// Get all users pending approval
export const getPendingApprovals = async (req, res) => {
  try {
    const pendingUsers = await userModel
      .find({
        role: { $in: ["user", "transportUser"] },
        isApproved: false,
      })
      .select("-password");

    return res.status(200).json({
      success: true,
      count: pendingUsers.length,
      data: pendingUsers,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Approve a user
export const approveUser = async (req, res) => {
  const { userId } = req.params;

  if (!userId) {
    return res.status(400).json({
      success: false,
      message: "User ID is required",
    });
  }

  try {
    const user = await userModel.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // if (user.role !== "transportUser") {
    //   return res.status(400).json({
    //     success: false,
    //     message: "Only transport users require approval",
    //   });
    // }

    if (user.isApproved) {
      return res.status(400).json({
        success: false,
        message: "User is already approved",
      });
    }

    user.isApproved = true;
    await user.save();

    // Send approval notification email to user
    try {
      const transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 587,
        secure: false,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      await transporter.sendMail({
        to: user.email,
        from: process.env.SMTP_USER,
        subject: "Account Approved for RRISPAT",
        html: ` <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>Account Approved</title>
      </head>   
      <body style="font-family: Arial, sans-serif; line-height: 1.6;">
        <p>Hello ${user.name},</p>

        <p>Your transport user account has been <strong>approved</strong> by the admin. You can now log in to access your dashboard:</p>

        <p><a href="https://logiyatra.rrispat.in" style="color: #007bff;">Click here to login</a></p>

        <p>Thank you for your patience.</p>

        <br />

        <p>Best regards,</p>
        <p><strong>RR ISPAT Support Team</strong><br/>
          Email: techsupport@rrispat.com<br/>
          Website: <a href="https://project.rrispat.in">rrispat.com</a>
        </p>
      </body>
    </html>`,
      });
    } catch (emailError) {
      console.error("Error sending approval email:", emailError);
      // We don't want to fail the approval if just the email fails
    }

    return res.status(200).json({
      success: true,
      message: "User approved successfully",
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Reject/Delete a user
export const rejectUser = async (req, res) => {
  const { userId } = req.params;

  if (!userId) {
    return res.status(400).json({
      success: false,
      message: "User ID is required",
    });
  }

  try {
    const user = await userModel.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.isApproved) {
      return res.status(400).json({
        success: false,
        message: "Invalid operation",
      });
    }

    const userEmail = user.email;
    const userName = user.name;

    await userModel.findByIdAndDelete(userId);

    // Send rejection notification email to user
    try {
      const transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 587,
        secure: false,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      await transporter.sendMail({
        to: userEmail,
        from: process.env.SMTP_USER,
        subject: "Account Application Status for RRISPAT",
        html: `!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>Account Application Declined</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6;">
        <p>Hello ${userName},</p>

        <p>We regret to inform you that your application for a <strong>transport user account</strong> has been declined.</p>

        <p>If you believe this was in error or would like more information, please contact our support team using the details below.</p>

        <br />

        <p>Best regards,</p>
        <p><strong>RR ISPAT Support Team</strong><br/>
          Email: techsupport@rrispat.com<br/>
          Website: <a href="https://project.rrispat.in">rrispat.com</a>
        </p>
      </body>
    </html>`,
      });
    } catch (emailError) {
      console.error("Error sending rejection email:", emailError);
      // We don't want to fail the rejection if just the email fails
    }

    return res.status(200).json({
      success: true,
      message: "User rejected and removed successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get all approved transport users
export const getApprovedTransportUsers = async (req, res) => {
  try {
    const transportUsers = await userModel
      .find({
        role: "transportUser",
        isApproved: true,
      })
      .select("-password");

    return res.status(200).json({
      success: true,
      count: transportUsers.length,
      data: transportUsers,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const getAllTenders = async (req, res) => {
  try {
    // Step 1: Get all tenders with selectedQuotation and creator info
    const tenders = await Tender.find()
      .sort({ createdAt: -1 })
      .populate({
        path: "selectedQuotation",
        populate: {
          path: "transportUser",
          select: "name email",
        },
      })
      .populate("createdBy", "name email");

    // Step 2: Fetch all quotations for all tenders
    const tenderIds = tenders.map((t) => t._id);
    const allQuotations = await Quotation.find({ tender: { $in: tenderIds } })
      .populate("transportUser", "name email")
      .sort({ createdAt: -1 });

    // Group quotations by tender ID
    const quotationsByTender = {};
    for (const q of allQuotations) {
      const signedFiles = (q.files || []).map((file) => {
        const key = file.url?.split("/").pop();
        return {
          ...file,
          url: generateSignedUrl(key),
        };
      });

      const formattedQuotation = {
        _id: q._id,
        price: q.price,
        vehicleNumber: q.vehicleNumber,
        createdAt: q.createdAt,
        transportUser: q.transportUser,
        files: signedFiles,
      };

      const tid = q.tender.toString();
      if (!quotationsByTender[tid]) quotationsByTender[tid] = [];
      quotationsByTender[tid].push(formattedQuotation);
    }

    // Step 3: Attach quotations to each tender
    const results = tenders.map((tender) => {
      const tenderObj = tender.toObject();
      tenderObj.quotations = quotationsByTender[tender._id.toString()] || [];

      // Add signed files to selectedQuotation too
      if (tenderObj.selectedQuotation && tenderObj.selectedQuotation.files) {
        tenderObj.selectedQuotation.files =
          tenderObj.selectedQuotation.files.map((file) => {
            const key = file.url?.split("/").pop();
            return {
              ...file,
              url: generateSignedUrl(key),
            };
          });
      }

      return tenderObj;
    });

    res.status(200).json({ success: true, data: results });
  } catch (error) {
    console.error("Error fetching tenders:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getRankedBestQuotationsForAllTenders = async (req, res) => {
  try {
    const tenders = await Tender.find().sort({ createdAt: -1 });

    const tenderReports = [];

    for (const tender of tenders) {
      const quotations = await Quotation.find({ tender: tender._id }).populate(
        "transportUser",
        "name email"
      );

      const bestByTransporter = new Map();

      for (const q of quotations) {
        const userId = q.transportUser._id.toString();
        if (!bestByTransporter.has(userId)) {
          bestByTransporter.set(userId, q);
        } else {
          const existing = bestByTransporter.get(userId);
          if (q.price < existing.price) {
            bestByTransporter.set(userId, q);
          }
        }
      }

      const bestQuotations = Array.from(bestByTransporter.values()).sort(
        (a, b) => {
          if (a.price !== b.price) return a.price - b.price;
          return a.createdAt - b.createdAt;
        }
      );

      const rankedResults = bestQuotations.map((q, index) => ({
        _id: q._id,
        quotedPrice: q.price,
        vehicleNumber: q.vehicleNumber,
        rank: `L${index + 1}`,
        selected:
          tender.selectedQuotation?.toString() === q._id.toString()
            ? "Yes"
            : "No",
        transporterName: q.transportUser?.name || "",
        vendorEmail: q.transportUser?.email || "",
        quotationDateTime: q.createdAt,
      }));

      // Format product with subMaterial + weight/quantity
      const formattedProduct = tender.materials
        .map((m) => {
          const material = m.material || "";
          const sub = m.subMaterial ? `(${m.subMaterial})` : "";
          const qty = `${m.weight || 0}kg / ${m.quantity || 0}pcs`;
          return `${material} ${sub} - ${qty}`;
        })
        .join(", ");

      tenderReports.push({
        tenderId: tender._id,
        tenderInfo: {
          product: formattedProduct,
          projectCode: tender.projectCode || "",
          projectName: tender.projectName || "",
          purchaseOrder: tender.purchaseOrder || "",
          projectRemark: tender.projectRemark || "",
          dispatchLocation: tender.dispatchLocation,
          deliveryWindow: tender.deliveryWindow,
          closeDate: tender.closeDate,
          biddingStart: tender.biddingStart,
          biddingEnd: tender.biddingEnd,
          remarks: tender.remarks,
          totalWeight: tender.totalWeight,
          totalQuantity: tender.totalQuantity,
          maxBidAmount: tender.maxBidAmount,
          status: tender.status,
          reopenCount: tender.reopenCount,
          winnerComment: tender.winnerComment,
          finalTransporter: tender.finalTransporter,
        },
        quotations: rankedResults,
      });
    }

    res.status(200).json({
      success: true,
      count: tenderReports.length,
      data: tenderReports,
    });
  } catch (error) {
    console.error("Error generating all tender reports:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};
