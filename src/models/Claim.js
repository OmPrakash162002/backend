import mongoose from 'mongoose';
import { CLAIMABLE_CATEGORIES } from '../config/policy.js';

const { Schema } = mongoose;

const clarificationSchema = new Schema({
  question: { type: String, required: true, trim: true, maxlength: 1000 },
  askedBy: String,
  askedAt: { type: Date, default: Date.now },
  answer: { type: String, trim: true, maxlength: 2000 },
  answeredBy: String,
  answeredAt: Date,
});

const claimSchema = new Schema(
  {
    // --- fields submitted by the employee ---
    claimant: { type: String, required: true, trim: true, maxlength: 100 },
    claimantId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true }, // the account that owns the claim
    claimantKey: { type: String, required: true }, // String(claimantId), used for duplicate/monthly lookups
    date: { type: Date, required: true },
    category: { type: String, enum: CLAIMABLE_CATEGORIES, required: true },
    amount: { type: Number, required: true, min: 0.01 },
    currency: { type: String, required: true },
    description: { type: String, required: true, trim: true, maxlength: 500 },
    receiptAvailable: { type: Boolean, required: true },

    // --- derived fields (deterministic + AI) ---
    amountBase: Number,
    effectiveCategory: String, // override > claimed > AI (if confident) > "unclassified"
    validation: { type: Schema.Types.Mixed }, // { issues, duplicates, monthlyTotalBase }
    ai: { type: Schema.Types.Mixed }, // { category, confidence, uncertain, verdict, findings, ... }

    // --- reviewer workflow ---
    status: {
      type: String,
      enum: ['pending_review', 'needs_clarification', 'approved', 'rejected'],
      default: 'pending_review',
    },
    override: { type: Schema.Types.Mixed, default: null }, // { category, reason, by, at, ... }
    clarifications: [clarificationSchema],
    decision: { type: Schema.Types.Mixed, default: null }, // { action, note, by, at }
    submittedBy: String,
  },
  { timestamps: true }
);

claimSchema.index({ claimantKey: 1, date: 1 });
claimSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model('Claim', claimSchema);
