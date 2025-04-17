import Quotation from "../models/quotationSchema.js";
import Tender from "../models/tenderSchema.js";
import { s3, BUCKET_NAME } from "../utils/minioClient.js";

export const submitQuotation = async (req, res) => {
  try {
    const { price, vehicleNumber } = req.body;
    const userId = req.user.id;
    const tenderId = req.params.id;

    // 1. Validate Tender
    const tender = await Tender.findById(tenderId);
    if (!tender || tender.status !== "open") {
      return res.status(400).json({
        success: false,
        message: "Tender is not open for quotation",
      });
    }

    const now = new Date();
    if (now < tender.biddingStart || now > tender.biddingEnd) {
      return res.status(403).json({
        success: false,
        message: "Bidding window is closed",
      });
    }

    // 2. Count previous quotations (3-bid limit)
    const bidCount = await Quotation.countDocuments({
      tender: tenderId,
      transportUser: userId,
    });

    if (bidCount >= 3) {
      return res.status(403).json({
        success: false,
        message: "You have reached the maximum of 3 bids for this tender",
      });
    }

    // 3. Upload file (if provided)
    let uploadedFiles = [];

    if (req.file) {
      const file = req.file;
      const filename = Date.now() + "-" + file.originalname;

      const params = {
        Bucket: BUCKET_NAME,
        Key: filename,
        Body: file.buffer,
        ContentType: file.mimetype,
      };

      const result = await s3.upload(params).promise();

      uploadedFiles.push({
        url: result.Location,
        originalName: file.originalname,
        mimetype: file.mimetype,
        uploadedAt: new Date(),
      });
    }

    // 4. Save Quotation
    const quotation = new Quotation({
      tender: tender._id,
      transportUser: userId,
      price,
      vehicleNumber,
      files: uploadedFiles,
    });

    await quotation.save();

    // 5. Link quotation to tender
    tender.quotations.push(quotation._id);
    await tender.save();

    res.status(201).json({
      success: true,
      message: `Quotation ${bidCount + 1}/3 submitted successfully.`,
      data: quotation,
    });
  } catch (error) {
    console.error("Quotation submission error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong: " + error.message,
    });
  }
};
