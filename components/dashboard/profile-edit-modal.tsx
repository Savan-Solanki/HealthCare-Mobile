// =====================================================================
// medikwik Patient - Profile Edit Modal
// A premium glassmorphic modal to update patient account and medical record details
// =====================================================================
'use client';

import React, { useRef, useState, useEffect } from 'react';
import { Camera, HeartPulse, Mail, MapPin, Phone, User, X, Calendar, ClipboardList } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { MAX_AVATAR_UPLOAD_BYTES } from '@/lib/avatar-image';
import { uploadPatientAvatar } from '@/lib/avatar-upload';
import AvatarCropModal from '@/components/dashboard/avatar-crop-modal';
import PatientAvatar from '@/components/dashboard/patient-avatar';

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const GENDERS = ['Male', 'Female', 'Other'];

const getProfileUpdateErrorMessage = (error: unknown): string => {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: { message?: unknown } } }).response;
    const responseMessage = response?.data?.message;

    if (typeof responseMessage === 'string' && responseMessage.trim()) {
      return responseMessage;
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return 'Failed to update profile. Please try again.';
};

interface ProfileEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialProfile: {
    name: string;
    email: string;
    phone: string;
    avatar: string | null;
  } | null;
  initialRecord: {
    age: number | null;
    gender: string | null;
    bloodGroup: string | null;
    emergencyContact: string | null;
    address: string | null;
    height: string | null;
    weight: string | null;
    allergies: string | null;
  } | null;
  onSaveSuccess: () => void | Promise<void>;
}

export default function ProfileEditModal({
  isOpen,
  onClose,
  initialProfile,
  initialRecord,
  onSaveSuccess,
}: ProfileEditModalProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [avatar, setAvatar] = useState<string | null>(null);
  const [pendingAvatarDataUrl, setPendingAvatarDataUrl] = useState<string | null>(null);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [age, setAge] = useState<number | ''>('');
  const [gender, setGender] = useState('');
  const [bloodGroup, setBloodGroup] = useState('');
  const [emergencyContact, setEmergencyContact] = useState('');
  const [address, setAddress] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [allergies, setAllergies] = useState('');

  const [submitting, setSubmitting] = useState(false);

  // Initialize fields when modal opens or initial data changes
  useEffect(() => {
    if (initialProfile) {
      setName(initialProfile.name || '');
      setEmail(initialProfile.email || '');
      setPhone(initialProfile.phone || '');
      setAvatar(initialProfile.avatar || null);
      setPendingAvatarDataUrl(null);
      setCropImageSrc(null);
    }

    if (initialRecord) {
      setAge(initialRecord.age ?? '');
      setGender(initialRecord.gender || '');
      setBloodGroup(initialRecord.bloodGroup || '');
      setEmergencyContact(initialRecord.emergencyContact || '');
      setAddress(initialRecord.address || '');
      setHeight(initialRecord.height || '');
      setWeight(initialRecord.weight || '');
      setAllergies(initialRecord.allergies || '');
    }
  }, [initialProfile, initialRecord, isOpen]);

  if (!isOpen) return null;

  const handlePhoneChange = (val: string) => {
    // Basic cleanup, strip non-plus/digits
    const cleaned = val.replace(/[^\d+]/g, '');
    setPhone(cleaned);
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Choose a JPG, PNG, or WEBP image.');
      return;
    }

    if (file.size > MAX_AVATAR_UPLOAD_BYTES) {
      toast.error('Photo must be 5 MB or smaller.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCropImageSrc(reader.result);
      }
    };
    reader.onerror = () => toast.error('Unable to read the selected photo.');
    reader.readAsDataURL(file);
  };

  const handleCropComplete = (dataUrl: string) => {
    setAvatar(dataUrl);
    setPendingAvatarDataUrl(dataUrl);
    setCropImageSrc(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error('Full Name is required.');
      return;
    }
    if (!email.trim()) {
      toast.error('Email address is required.');
      return;
    }
    if (!phone.trim()) {
      toast.error('Phone number is required.');
      return;
    }

    // Validate phone number regex (matches backend validate matches(/^\+\d{1,4}\d{10}$/))
    // Help formatting it: if 10 digits, auto prepend +91
    let formattedPhone = phone.trim().replace(/\s+/g, '');
    if (formattedPhone.length === 10 && /^\d+$/.test(formattedPhone)) {
      formattedPhone = `+91${formattedPhone}`;
    } else if (formattedPhone.length > 0 && !formattedPhone.startsWith('+')) {
      formattedPhone = `+${formattedPhone}`;
    }

    const phoneRegex = /^\+\d{1,4}\d{10}$/;
    if (!phoneRegex.test(formattedPhone)) {
      toast.error('Phone number must include country code (e.g. +919876543210).');
      return;
    }

    setSubmitting(true);
    try {
      if (pendingAvatarDataUrl) {
        const uploadedAvatarUrl = await uploadPatientAvatar(pendingAvatarDataUrl);
        setAvatar(uploadedAvatarUrl);
        setPendingAvatarDataUrl(null);
      }

      const payload = {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: formattedPhone,
        age: age === '' ? null : Number(age),
        gender: gender || null,
        bloodGroup: bloodGroup || null,
        emergencyContact: emergencyContact.trim() || null,
        address: address.trim() || null,
        height: height || undefined,
        weight: weight || undefined,
        allergies: allergies || undefined,
      };

      const res = await api.put('/patient/profile', payload);

      if (res.data.success) {
        toast.success('Profile updated successfully!');
        await onSaveSuccess();
        onClose();
      } else {
        toast.error(res.data.message || 'Something went wrong.');
      }
    } catch (error: unknown) {
      console.error('[ProfileEditModal] Profile update failed:', error);
      toast.error(getProfileUpdateErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl relative my-8 flex flex-col overflow-hidden max-h-[90vh]">
        {/* Header Section with elegant medical cyan theme */}
        <div className="bg-gradient-to-r from-teal-700 via-cyan-700 to-sky-700 p-6 text-white relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 rounded-full p-2 bg-white/10 text-white hover:bg-white/20 transition-colors"
            type="button"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
          
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-white/15 backdrop-blur-md">
              <HeartPulse className="h-6 w-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Edit Health Profile</h2>
              <p className="text-xs text-cyan-100/90 mt-0.5">
                Complete your details to increase your profile completion score.
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          
          <div className="space-y-3">
            <label className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
              <User className="h-4 w-4 text-teal-600" />
              Profile photo
            </label>

            <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <PatientAvatar
                avatar={avatar}
                className="h-20 w-20 border-2 border-teal-600 text-lg shadow-sm"
                initials={name ? name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() : 'PT'}
                name={name || 'Patient'}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-800">Upload your own photo</p>
                <p className="mt-1 text-xs text-slate-500">
                  JPG, PNG, or WEBP up to 5 MB. Stored securely in your patient folder.
                </p>
                <button
                  type="button"
                  onClick={handleUploadClick}
                  className="mt-3 inline-flex items-center gap-2 rounded-xl border border-teal-200 bg-white px-3.5 py-2 text-xs font-semibold text-teal-700 transition hover:bg-teal-50"
                >
                  <Camera className="h-4 w-4" />
                  {avatar ? 'Change photo' : 'Upload photo'}
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/jpg"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
          </div>

          {cropImageSrc ? (
            <AvatarCropModal
              imageSrc={cropImageSrc}
              onCancel={() => setCropImageSrc(null)}
              onComplete={handleCropComplete}
            />
          ) : null}

          <hr className="border-slate-100" />

          {/* Form Fields Grid */}
          <div className="grid gap-5 sm:grid-cols-2">
            
            {/* Account Details Group */}
            <div className="sm:col-span-2 space-y-1">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Account Details</span>
            </div>

            {/* Name */}
            <div className="space-y-1.5">
              <label htmlFor="name" className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-slate-400" /> Full Name
              </label>
              <input
                id="name"
                type="text"
                required
                placeholder="John Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-slate-900 placeholder-slate-400 focus:border-teal-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-all text-sm font-medium"
              />
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 text-slate-400" /> Email Address
              </label>
              <input
                id="email"
                type="email"
                required
                placeholder="johndoe@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-slate-900 placeholder-slate-400 focus:border-teal-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-all text-sm font-medium"
              />
            </div>

            {/* Phone */}
            <div className="space-y-1.5">
              <label htmlFor="phone" className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5 text-slate-400" /> Phone Number
              </label>
              <input
                id="phone"
                type="tel"
                required
                placeholder="+919876543210"
                value={phone}
                onChange={(e) => handlePhoneChange(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-slate-900 placeholder-slate-400 focus:border-teal-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-all text-sm font-medium"
              />
              <p className="text-[10px] text-slate-400 ml-1">Must include country code (e.g. +91 or +1)</p>
            </div>

            {/* Emergency Contact — moved to Account Details */}
            <div className="space-y-1.5">
              <label htmlFor="emergencyContact" className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5 text-slate-400" /> Emergency Contact
              </label>
              <input
                id="emergencyContact"
                type="text"
                placeholder="Emergency Contact Name or Number"
                value={emergencyContact}
                onChange={(e) => setEmergencyContact(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-slate-900 placeholder-slate-400 focus:border-teal-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-all text-sm font-medium"
              />
            </div>

            {/* Personal Details Group */}
            <div className="sm:col-span-2 space-y-1 mt-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Medical Record Details</span>
            </div>

            {/* Age */}
            <div className="space-y-1.5">
              <label htmlFor="age" className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-slate-400" /> Age
              </label>
              <input
                id="age"
                type="number"
                min="0"
                max="125"
                placeholder="Age"
                value={age}
                onChange={(e) => setAge(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-slate-900 placeholder-slate-400 focus:border-teal-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-all text-sm font-medium"
              />
            </div>

            {/* Gender */}
            <div className="space-y-1.5">
              <label htmlFor="gender" className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-slate-400" /> Gender
              </label>
              <select
                id="gender"
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-slate-900 placeholder-slate-400 focus:border-teal-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-all text-sm font-medium appearance-none"
              >
                <option value="">Select Gender</option>
                {GENDERS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>

            {/* Blood Group */}
            <div className="space-y-1.5">
              <label htmlFor="bloodGroup" className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <ClipboardList className="h-3.5 w-3.5 text-slate-400" /> Blood Group
              </label>
              <select
                id="bloodGroup"
                value={bloodGroup}
                onChange={(e) => setBloodGroup(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-slate-900 placeholder-slate-400 focus:border-teal-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-all text-sm font-medium appearance-none"
              >
                <option value="">Select Blood Group</option>
                {BLOOD_GROUPS.map((bg) => (
                  <option key={bg} value={bg}>
                    {bg}
                  </option>
                ))}
              </select>
            </div>

            {/* Height & Weight — side by side */}
            <div className="sm:col-span-2 grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="pe-height" className="block text-sm font-medium text-gray-700">Height</label>
                <input id="pe-height" type="text" placeholder="e.g. 5'8&quot; or 172 cm"
                  value={height} onChange={(e) => setHeight(e.target.value)} disabled={submitting}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-slate-900 placeholder-slate-400 focus:border-teal-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-all text-sm font-medium" />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="pe-weight" className="block text-sm font-medium text-gray-700">Weight</label>
                <input id="pe-weight" type="text" placeholder="e.g. 70 kg"
                  value={weight} onChange={(e) => setWeight(e.target.value)} disabled={submitting}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-slate-900 placeholder-slate-400 focus:border-teal-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-all text-sm font-medium" />
              </div>
            </div>

            {/* Allergies */}
            <div className="sm:col-span-2 space-y-1.5">
              <label htmlFor="pe-allergies" className="block text-sm font-medium text-gray-700">Allergies</label>
              <textarea id="pe-allergies" placeholder="List any known allergies (e.g. Penicillin, Peanuts, Latex)"
                value={allergies} onChange={(e) => setAllergies(e.target.value)} disabled={submitting}
                rows={2} className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-slate-900 placeholder-slate-400 focus:border-teal-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-all text-sm font-medium resize-none" />
            </div>

            {/* Address */}
            <div className="sm:col-span-2 space-y-1.5">
              <label htmlFor="address" className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-slate-400" /> Residential Address
              </label>
              <textarea
                id="address"
                rows={3}
                placeholder="Enter your street address, city, state, zip"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-slate-900 placeholder-slate-400 focus:border-teal-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-all text-sm font-medium resize-none"
              />
            </div>

          </div>

          {/* Footer Actions */}
          <div className="pt-4 flex gap-3 sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex-1 sm:flex-none min-h-12 px-6 rounded-full border border-slate-200 bg-white text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 sm:flex-none min-h-12 px-8 rounded-full bg-gradient-to-r from-teal-700 to-sky-700 text-sm font-bold text-white shadow-lg hover:shadow-xl hover:brightness-105 active:scale-98 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting ? 'Saving Updates...' : 'Save Profile'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
