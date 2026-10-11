import mongoose from 'mongoose';

// Append-only history. Nothing in the app updates or deletes these documents.
const auditLogSchema = new mongoose.Schema({
  claimId: { type: mongoose.Schema.Types.ObjectId, ref: 'Claim', required: true, index: true },
  action: { type: String, required: true },
  actor: { type: String, default: 'unknown' }, // display name
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  actorRole: String,
  details: { type: mongoose.Schema.Types.Mixed, default: {} },
  at: { type: Date, default: Date.now },
});

export default mongoose.model('AuditLog', auditLogSchema);
