import mongoose from 'mongoose'
import crypto from 'crypto'
import bcrypt from 'bcrypt'
import JWT from 'jsonwebtoken'

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Name is mandatory'],
    },
    email: {
        type: String,
        required: [true, 'Email is mandatory'],
        unique: [true, 'already registered email'],
    },
    phone: {
        type: String,
        required: true,
        unique: true,
    },
    password: {
        type: String,
        required: true,
        select: false
    },
    role: {
        type: String,
        enum: ['user', 'admin', 'transportUser'],
        default: 'user'
    },
    // New field for approval status
    isApproved: {
        type: Boolean,
        default: function () {
            // Automatically approve regular users, but require approval for transportUsers
            return this.role === 'admin';
        }
    },
    forgotPasswordToken: {
        type: String,
    },
    forgotPasswordExpiryDate: {
        type: Date,
    }
}, { timestamps: true });

userSchema.pre('save', async function (next) {
    // If password is not modified then do not hash it
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 10);
    return next();
});

userSchema.methods = {
    jwtToken() {
        return JWT.sign(
            {
                id: this._id,
                email: this.email,
                role: this.role,
                isApproved: this.isApproved
            },
            process.env.SECRET,
            { expiresIn: '24h' }
        );
    },

    getForgotPasswordToken() {
        const forgotToken = crypto.randomBytes(20).toString('hex');
        this.forgotPasswordToken = crypto
            .createHash('sha256')
            .update(forgotToken)
            .digest('hex');

        this.forgotPasswordExpiryDate = Date.now() + 20 * 60 * 1000;
        return forgotToken;
    },
};

const userModel = mongoose.model('user', userSchema)
export default userModel;