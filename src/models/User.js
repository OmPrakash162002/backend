import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    passwordHash: { type: String, required: true, select: false }, // never returned unless asked for explicitly
    role: { type: String, enum: ['employee', 'reviewer'], default: 'employee' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

userSchema.methods.toPublic = function toPublic() {
  return { id: String(this._id), name: this.name, email: this.email, role: this.role };
};

export default mongoose.model('User', userSchema);
