// models/Entities.js
const mongoose = require('mongoose');

const EmployeeSchema = new mongoose.Schema({
  name: String,
  role: String,
}, { timestamps: true });

const PaymentSchema = new mongoose.Schema({
  studentId: mongoose.Schema.Types.ObjectId,
  amount: Number,
  date: Date,
}, { timestamps: true });

const CashRequestSchema = new mongoose.Schema({
  requester: String,
  amount: Number,
  status: String,
}, { timestamps: true });

const AdmissionSchema = new mongoose.Schema({
  name: String,
  status: String,
}, { timestamps: true });

const HostelApplicationSchema = new mongoose.Schema({
  studentId: mongoose.Schema.Types.ObjectId,
  status: String,
}, { timestamps: true });

const TransportApplicationSchema = new mongoose.Schema({
  studentId: mongoose.Schema.Types.ObjectId,
  status: String,
}, { timestamps: true });

const LibraryRequestSchema = new mongoose.Schema({
  studentId: mongoose.Schema.Types.ObjectId,
  status: String,
}, { timestamps: true });

const InventoryRequestSchema = new mongoose.Schema({
  requester: String,
  status: String,
}, { timestamps: true });

const LeaveApplicationSchema = new mongoose.Schema({
  employeeId: mongoose.Schema.Types.ObjectId,
  status: String,
}, { timestamps: true });
const ParentSchema = new mongoose.Schema({
  name: String,
  email: String,
  phone: String,
}, { timestamps: true });
module.exports = {
  Employee: mongoose.model('Employee', EmployeeSchema),
  Payment: mongoose.model('Payment', PaymentSchema),
  CashRequest: mongoose.model('CashRequest', CashRequestSchema),
  Admission: mongoose.model('Admission', AdmissionSchema),
  Payment: mongoose.model('Payment', PaymentSchema),
  HostelApplication: mongoose.model('HostelApplication', HostelApplicationSchema),
  TransportApplication: mongoose.model('TransportApplication', TransportApplicationSchema),
  LibraryRequest: mongoose.model('LibraryRequest', LibraryRequestSchema),
  InventoryRequest: mongoose.model('InventoryRequest', InventoryRequestSchema),
  LeaveApplication: mongoose.model('LeaveApplication', LeaveApplicationSchema),
};
