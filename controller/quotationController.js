import Quotation from "../models/quotationSchema.js";
import Tender from "../models/tenderSchema.js";
import { s3, BUCKET_NAME } from "../utils/minioClient.js";

export const submitQuotation = async (req, res) => {
  try {
    const { price, vehicleNumber } = req.body;
    const userId = req.user.id; // from jwtAuth middleware
    const tenderId = req.params.id;

    // 1. Validate tender existence and status
    const tender = await Tender.findById(tenderId);
    if (!tender || tender.status !== "open") {
      return res.status(400).json({
        success: false,
        message: "Tender is not open for quotation",
      });
    }

    // 2. Check if quotation already submitted by this user
    const existing = await Quotation.findOne({
      tender: tender._id,
      transportUser: userId,
    });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: "You have already submitted a quotation",
      });
    }

    // 3. Handle file upload to MinIO
    let uploadedFiles = [];
    console.log("hello");
    
    if (req.file) {
      const file = req.file;
      const filename = Date.now() + '-' + file.originalname;

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

    // 4. Create and save quotation
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

    // 6. Respond
    res.status(201).json({
      success: true,
      message: "Quotation submitted successfully",
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
