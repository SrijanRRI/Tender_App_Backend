import userModel from "../models/userSchema.js"
import nodemailer from 'nodemailer';

// Get all users pending approval
export const getPendingApprovals = async (req, res) => {
  try {
    const pendingUsers = await userModel.find({ 
      role: 'transportUser', 
      isApproved: false 
    }).select('-password');
    
    return res.status(200).json({
      success: true,
      count: pendingUsers.length,
      data: pendingUsers
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Approve a user
export const approveUser = async (req, res) => {
  const { userId } = req.params;
  
  if (!userId) {
    return res.status(400).json({
      success: false,
      message: "User ID is required"
    });
  }
  
  try {
    const user = await userModel.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }
    
    if (user.role !== 'transportUser') {
      return res.status(400).json({
        success: false,
        message: "Only transport users require approval"
      });
    }
    
    if (user.isApproved) {
      return res.status(400).json({
        success: false,
        message: "User is already approved"
      });
    }
    
    user.isApproved = true;
    await user.save();
    
    // Send approval notification email to user
    try {
      const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
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
        subject: 'Account Approved',
        html: `<p>Hello ${user.name},</p>
              <p>Your transport user account has been approved by the admin. You can now login to access your dashboard.</p>
              <p>Thank you for your patience.</p>`,
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
        role: user.role
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Reject/Delete a user
export const rejectUser = async (req, res) => {
  const { userId } = req.params;
  
  if (!userId) {
    return res.status(400).json({
      success: false,
      message: "User ID is required"
    });
  }
  
  try {
    const user = await userModel.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }
    
    if (user.role !== 'transportUser' || user.isApproved) {
      return res.status(400).json({
        success: false,
        message: "Invalid operation"
      });
    }
    
    const userEmail = user.email;
    const userName = user.name;
    
    await userModel.findByIdAndDelete(userId);
    
    // Send rejection notification email to user
    try {
      const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
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
        subject: 'Account Application Status',
        html: `<p>Hello ${userName},</p>
              <p>We regret to inform you that your application for a transport user account has been declined.</p>
              <p>If you believe this was in error or would like more information, please contact our support team.</p>`,
      });
    } catch (emailError) {
      console.error("Error sending rejection email:", emailError);
      // We don't want to fail the rejection if just the email fails
    }
    
    return res.status(200).json({
      success: true,
      message: "User rejected and removed successfully"
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get all approved transport users
export const getApprovedTransportUsers = async (req, res) => {
  try {
    const transportUsers = await userModel.find({ 
      role: 'transportUser', 
      isApproved: true 
    }).select('-password');
    
    return res.status(200).json({
      success: true,
      count: transportUsers.length,
      data: transportUsers
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};