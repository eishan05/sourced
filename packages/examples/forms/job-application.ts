import { defineForm } from "@ai-native-forms/core";

export const jobApplicationForm = defineForm({
  id: "job-application",
  title: "Job Application",
  version: 1,
  context: "This is a job application for a software engineering role.",
  sections: [
    {
      id: "contact",
      title: "Contact",
      fields: [
        { id: "fullName", type: "text", label: "Full name", required: true },
        { id: "email", type: "email", label: "Email", required: true },
        { id: "phone", type: "phone", label: "Phone" },
        {
          id: "location",
          type: "text",
          label: "Location",
          description: "City and state, or city and country",
        },
        {
          id: "linkedin",
          type: "text",
          label: "LinkedIn",
          description: "LinkedIn profile URL",
          constraints: {
            pattern:
              "^(?:https?://)?(?:www\\.)?linkedin\\.com/in/[A-Za-z0-9_-]+/?$",
            patternMessage: "Enter a valid LinkedIn profile URL",
          },
        },
      ],
    },
    {
      id: "employment",
      title: "Employment",
      fields: [
        {
          id: "currentlyEmployed",
          type: "boolean",
          label: "Currently employed",
          required: true,
          policy: "infer",
          description: "Whether the applicant is currently employed",
        },
      ],
    },
    {
      id: "currentRole",
      title: "Current role",
      showWhen: { field: "currentlyEmployed", truthy: true },
      fields: [
        { id: "employer", type: "text", label: "Employer" },
        { id: "title", type: "text", label: "Job title" },
        {
          id: "startDate",
          type: "date",
          label: "Start date",
          description:
            "Start date of the current role; if only a month is known use the first of the month",
        },
      ],
    },
    {
      id: "education",
      title: "Education",
      fields: [
        { id: "school", type: "text", label: "School" },
        { id: "degree", type: "text", label: "Degree" },
        {
          id: "gradYear",
          type: "number",
          label: "Graduation year",
          constraints: { min: 1950, max: 2035 },
        },
      ],
    },
    {
      id: "skills",
      title: "Skills",
      fields: [
        {
          id: "skills",
          type: "multiselect",
          label: "Skills",
          options: [
            { value: "typescript", label: "TypeScript" },
            { value: "react", label: "React" },
            { value: "node-js", label: "Node.js" },
            { value: "python", label: "Python" },
            { value: "go", label: "Go" },
            { value: "rust", label: "Rust" },
            { value: "sql", label: "SQL" },
            { value: "aws", label: "AWS" },
            { value: "gcp", label: "GCP" },
            { value: "docker", label: "Docker" },
            { value: "kubernetes", label: "Kubernetes" },
            { value: "figma", label: "Figma" },
          ],
        },
      ],
    },
    {
      id: "experience",
      title: "Experience",
      fields: [
        {
          id: "yearsExperience",
          type: "number",
          label: "Years of experience",
          policy: "infer",
          description:
            "Total years of professional experience; may be inferred from employment dates",
          constraints: { min: 0, max: 60 },
        },
      ],
    },
    {
      id: "about",
      title: "About",
      fields: [
        {
          id: "coverNote",
          type: "textarea",
          label: "Cover note",
          policy: "infer",
          description:
            "A short note on why the applicant is interested; may be drafted from the resume",
          constraints: { maxLength: 1500 },
        },
      ],
    },
    {
      id: "eligibility",
      title: "Eligibility",
      fields: [
        {
          id: "workAuthorization",
          type: "select",
          label: "Work authorization",
          policy: "human",
          required: true,
          options: [
            { value: "citizen", label: "Citizen or national" },
            { value: "permanent-resident", label: "Permanent resident" },
            {
              value: "needs-sponsorship",
              label: "Will need visa sponsorship",
            },
            { value: "other", label: "Other" },
          ],
        },
        {
          id: "willingToRelocate",
          type: "boolean",
          label: "Willing to relocate",
          policy: "human",
        },
      ],
    },
  ],
});
