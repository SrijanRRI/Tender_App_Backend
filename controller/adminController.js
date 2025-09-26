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
export const approveUserTwoStep = async (req, res) => {
  const { userId } = req.params;
  const approverId = req.user?.id; // set by your auth middleware
  const approverRole = req.user?.role; // "admin", etc.

  if (!userId) {
    return res.status(400).json({ success: false, message: "User ID is required" });
  }
  if (approverRole !== "admin") {
    return res.status(403).json({ success: false, message: "Only admins can approve" });
  }

  try {
    const target = await userModel.findById(userId);
    if (!target) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (target.isApproved) {
      // Already finalized — we still might need to return state
      return res.status(200).json({
        success: true,
        message: "User already fully approved",
        data: {
          id: target._id,
          name: target.name,
          email: target.email,
          role: target.role,
          isApproved: true,
          currentApprovals: target.approvals?.approvedBy?.length || 0,
          requiredApprovals: target.approvals?.requiredApprovals || 2,
          finalizedAt: target.approvals?.finalizedAt || null,
        },
      });
    }

    // 1) Idempotent add: record this admin's approval only if not present
    const added = await userModel.findOneAndUpdate(
      {
        _id: userId,
        isApproved: false,
        "approvals.approvedBy": { $ne: approverId },
      },
      {
        $addToSet: { "approvals.approvedBy": approverId },
        $setOnInsert: { "approvals.requiredApprovals": 2 },
      },
      { new: true }
    );

    if (!added) {
      // Couldn't add — maybe same admin or race
      const fresh = await userModel.findById(userId);
      const alreadyThisAdmin = fresh?.approvals?.approvedBy?.some(
        (id) => String(id) === String(approverId)
      );
      return res.status(200).json({
        success: true,
        message: alreadyThisAdmin
          ? "Your approval was already recorded"
          : fresh?.isApproved
          ? "User already fully approved"
          : "Approval not recorded (possibly a race). Try again.",
        data: fresh
          ? {
              id: fresh._id,
              isApproved: fresh.isApproved,
              currentApprovals: fresh.approvals?.approvedBy?.length || 0,
              requiredApprovals: fresh.approvals?.requiredApprovals || 2,
              finalizedAt: fresh.approvals?.finalizedAt || null,
            }
          : undefined,
      });
    }

    const currentApprovals = added.approvals?.approvedBy?.length || 0;
    const required = added.approvals?.requiredApprovals || 2;

    // 2) If threshold met, flip isApproved exactly once
    let finalDoc = added;
    if (currentApprovals >= required && !added.isApproved) {
      const finalized = await userModel.findOneAndUpdate(
        { _id: userId, isApproved: false },
        { $set: { isApproved: true, "approvals.finalizedAt": new Date() } },
        { new: true }
      );
      if (finalized) {
        finalDoc = finalized;
      }
    }

    // 3) EMAIL GATE: send only once when finally approved
    // Try to "lock" the notification by setting notifiedAt if still null
    let shouldSendEmail = false;
    let notifyDoc = finalDoc;

    if (finalDoc.isApproved) {
      const locked = await userModel.findOneAndUpdate(
        {
          _id: userId,
          isApproved: true,
          "approvals.finalizedAt": { $ne: null },
          $or: [
            { "approvals.notifiedAt": { $exists: false } }, // if field didn't exist yet
            { "approvals.notifiedAt": null },               // or still null
          ],
        },
        { $set: { "approvals.notifiedAt": new Date() } },
        { new: true }
      );

      if (locked) {
        // We won the lock -> we are the only request that should send the email
        shouldSendEmail = true;
        notifyDoc = locked;
      }
    }

    if (shouldSendEmail) {
      try {
        const transporter = nodemailer.createTransport({
          host: "smtp.gmail.com",
          port: 587,
          secure: false,
          auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        });

        await transporter.sendMail({
          to: notifyDoc.email,
          from: process.env.SMTP_USER,
          subject: "Account Approved for RRISPAT",
          html: `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Account Approved</title></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6;">
  <p>Hello ${notifyDoc.name},</p>
  <p>Your transport user account has been <strong>approved</strong> by the admins. You can now log in:</p>
  <p><a href="https://logiyatra.rrispat.in">Click here to login</a></p>
  <p>Thank you for your patience.</p>
  <br/>
  <p>Best regards,</p>
  <p><strong>RR ISPAT Support Team</strong><br/>
    Email: techsupport@rrispat.com<br/>
    Website: <a href="https://project.rrispat.in">rrispat.com</a>
  </p>
</body></html>`,
        });
      } catch (e) {
        console.error("Error sending final approval email:", e);
        // don't fail the request due to email issue
      }
    }

    // Always reply with the latest known doc
    const out = notifyDoc || finalDoc;

    return res.status(200).json({
      success: true,
      message: out.isApproved
        ? (shouldSendEmail
            ? "User fully approved and notified"
            : `User fully approved (${currentApprovals}/${required})`)
        : `Admin approval recorded (${currentApprovals}/${required})`,
      data: {
        id: out._id,
        name: out.name,
        email: out.email,
        role: out.role,
        isApproved: out.isApproved,
        currentApprovals: out.approvals?.approvedBy?.length || 0,
        requiredApprovals: out.approvals?.requiredApprovals || 2,
        finalizedAt: out.approvals?.finalizedAt || null,
        notifiedAt: out.approvals?.notifiedAt || null,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
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
