import { defineForm } from "@sourced/core";

export const medicalIntakeForm = defineForm({
  id: "medical-intake",
  title: "Medical Intake",
  description:
    "Share the details needed for your visit. AI suggestions must be reviewed, and consent is always yours to provide.",
  version: 1,
  context:
    "This is a general outpatient medical intake form. Do not diagnose or invent clinical details.",
  sections: [
    {
      id: "patient",
      title: "Patient",
      fields: [
        {
          id: "fullName",
          type: "text",
          label: "Full name",
          policy: "human",
        },
        {
          id: "dateOfBirth",
          type: "date",
          label: "Date of birth",
          policy: "human",
        },
        { id: "phone", type: "phone", label: "Phone", policy: "human" },
        { id: "email", type: "email", label: "Email", policy: "human" },
      ],
    },
    {
      id: "visit",
      title: "Visit",
      fields: [
        {
          id: "reasonForVisit",
          type: "textarea",
          label: "Reason for visit",
          policy: "infer",
          description: "A short summary based on what you shared",
        },
        {
          id: "symptomOnset",
          type: "date",
          label: "When symptoms started",
        },
      ],
    },
    {
      id: "history",
      title: "History",
      fields: [
        {
          id: "conditions",
          type: "multiselect",
          label: "Current conditions",
          options: [
            { value: "asthma", label: "Asthma" },
            { value: "diabetes", label: "Diabetes" },
            { value: "hypertension", label: "High blood pressure" },
            { value: "heart-disease", label: "Heart disease" },
            { value: "arthritis", label: "Arthritis" },
            { value: "anxiety", label: "Anxiety" },
            { value: "depression", label: "Depression" },
          ],
        },
        {
          id: "medications",
          type: "textarea",
          label: "Current medications",
          policy: "human",
        },
        {
          id: "allergies",
          type: "text",
          label: "Allergies",
          policy: "human",
        },
      ],
    },
    {
      id: "insurance",
      title: "Insurance",
      fields: [
        {
          id: "hasInsurance",
          type: "boolean",
          label: "Do you have insurance?",
          policy: "infer",
        },
      ],
    },
    {
      id: "insuranceDetails",
      title: "Insurance details",
      showWhen: { field: "hasInsurance", truthy: true },
      fields: [
        { id: "provider", type: "text", label: "Insurance provider" },
        {
          id: "memberId",
          type: "text",
          label: "Member ID",
          policy: "human",
          constraints: {
            pattern: "^[A-Z0-9]{8,12}$",
            patternMessage:
              "Member ID must be 8–12 uppercase letters or numbers",
          },
        },
      ],
    },
    {
      id: "consent",
      title: "Consent",
      fields: [
        {
          id: "consentToTreatment",
          type: "boolean",
          label: "I consent to treatment",
          policy: "human",
          required: true,
        },
        {
          id: "emergencyContact",
          type: "text",
          label: "Emergency contact",
          policy: "human",
        },
      ],
    },
  ],
});
