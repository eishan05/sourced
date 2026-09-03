import { defineForm } from "../definition";

export const testForm = defineForm({
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
        {
          id: "linkedin",
          type: "text",
          label: "LinkedIn",
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
      ],
    },
    {
      id: "education",
      title: "Education",
      fields: [
        {
          id: "gradYear",
          type: "number",
          label: "Graduation year",
          constraints: { min: 1950, max: 2035 },
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
            { value: "needs-sponsorship", label: "Needs sponsorship" },
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
