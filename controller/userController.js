import userModel from "../models/userSchema.js"
import bcrypt from "bcrypt"
import crypto from "crypto"
import emailValidator from "email-validator"
import nodemailer from "nodemailer"

export const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: "Email and password are required"
    });
  }

  try {
    // Find user and select password field explicitly
    const user = await userModel.findOne({ email }).select('+password');

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "User not found 🙅"
      });
    }

    // For transportUsers, check if they're approved
    if (user.role === 'transportUser' && !user.isApproved) {
      return res.status(403).json({
        success: false,
        message: "Your account is pending admin approval"
      });
    }

    // Compare password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({
        success: false,
        message: "Invalid credentials"
      });
    }

    // Generate token (include isApproved if needed in middleware)
    const token = user.jwtToken();

    // 🔐 Cookie options for deployment
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production", // true in production (HTTPS)
      sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax", // "None" allows cross-origin with credentials
      maxAge: 24 * 60 * 60 * 1000 // 1 day
    };

    // Remove password before sending user data
    const userData = user.toObject();
    delete userData.password;

    return res.status(200)
      .cookie("token", token, cookieOptions)
      .json({
        success: true,
        message: "Login successful",
        data: userData
      });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server error: " + error.message
    });
  }
};







  export const signup = async(req, res) => {
    const { name, email, password, confirmPassword, role } = req.body;
    
    if (!name || !email || !password || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Every field is required"
      });
    }
    
    const validEmail = emailValidator.validate(email);
    if (!validEmail) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address 📩"
      });
    }
    
    try {
      if (password !== confirmPassword) {
        return res.status(400).json({
          success: false,
          message: "password and confirm Password does not match ❌"
        });
      }
      
      // Role validation - only allow 'user' and 'transportUser' roles during signup
      if (role && !['user', 'transportUser'].includes(role)) {
        return res.status(400).json({
          success: false,
          message: "Invalid role specified"
        });
      }
      
      // Create a new user with the provided data
      const userInfo = new userModel({
        name,
        email,
        password,
        role: role || 'user'
      });
      
      const result = await userInfo.save();
      
      // Prepare response with appropriate message for transportUsers
      let message = "Account created successfully";
      if (role === 'transportUser') {
        message = "Account created successfully. Please wait for admin approval before you can login.";
      }
      
      // Don't send password in response
      const sanitizedResult = result.toObject();
      delete sanitizedResult.password;
      
      return res.status(200).json({
        success: true,
        message,
        data: sanitizedResult
      });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(400).json({
          success: false,
          message: `Account already exist with the provided email ${email} 😒`
        });
      }
      
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
  };



export const logout = async (req, res, next) => {
    try {
      const cookieOption = {
        expires: new Date(), 
        httpOnly: true 
      };
  
      
      res.cookie("token", null, cookieOption);
      res.status(200).json({
        success: true,
        message: "Logged Out"
      });
    } catch (error) {
      res.stats(400).json({
        success: false,
        message: error.message
      });
    }
  };




export const getUser = async (req, res) => {
    const userId = req.user.id;
    try {
      const user = await userModel.findById(userId);
      return res.status(200).json({
        success: true,
        data: user
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
  };





export const forgotPassword = async (req, res, next) => {
    const email = req.body.email;
  
    
    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required"
      });
    }
  
    try {
      
      const user = await userModel.findOne({
        email
      });
  
     
      if (!user) {
        return res.status(400).json({
          success: false,
          message: "user not found 🙅"
        });
      }
  
      
      const forgotPasswordToken = user.getForgotPasswordToken();
      console.log(forgotPasswordToken);
      
  
      await user.save();

      const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 587,                
        secure: false,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
      const resetUrl = `${process.env.CLIENT_URL}/reset-password/${forgotPasswordToken}`;

      // Send password reset email
      await transporter.sendMail({
        to: email,
        from: process.env.SMTP_USER,
        subject: 'Password Reset Request',
        html: `<p>You requested a password reset</p>
               <p>Click this <a href="${resetUrl}">link</a> to reset your password. The link will expire in 1 hour.</p>`,
      });
  
      return res.status(200).json({
        success: true,
        message: 'Password reset link is successfully send to your mail id'
      });

    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
  };




  
  
export const resetPassword = async (req, res, next) => {
    const { token } = req.params;
    const { password, confirmPassword } = req.body;
    console.log(token);
    
  
    // return error message if password or confirmPassword is missing
    if (!password || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "password and confirmPassword is required"
      });
    }
  
    // return error message if password and confirmPassword  are not same
    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "password and confirm Password does not match ❌"
      });
    }
  
    const hashToken = crypto.createHash("sha256").update(token).digest("hex");
    console.log(hashToken);
    
    try {
      const user = await userModel.findOne({
        forgotPasswordToken: hashToken,
        forgotPasswordExpiryDate: {
          $gt: new Date() // forgotPasswordExpiryDate() less the current date
        }
      });
  
      // return the message if user not found
      if (!user) {
        return res.status(400).json({
          success: false,
          message: "Invalid Token or token is expired"
        });
      }
  
      user.password = password;
      await user.save();
  
      return res.status(200).json({
        success: true,
        message: "successfully reset the password"
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
  };

  export const getUserById = async (req, res) => {
    const { id } = req.params;
  
    if (!id) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }
  
    try {
      const user = await userModel.findById(id).select("-password"); // exclude password
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }
  
      return res.status(200).json({
        success: true,
        data: user,
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID or database error: " + error.message,
      });
    }
  };
  

