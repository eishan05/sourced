import { useField } from "../context";

export interface IssuesProps {
  fieldId: string;
  className?: string;
}

export function Issues({ fieldId, className }: IssuesProps) {
  const field = useField(fieldId);
  const issues = field.draft
    ? field.issues.filter((issue) => issue.severity !== "error")
    : field.issues;
  if (issues.length === 0) return null;

  return (
    <ul className={className} id={`${fieldId}-issues`}>
      {issues.map((issue) => (
        <li
          data-severity={issue.severity}
          key={`${issue.code}-${issue.message}`}
        >
          {issue.message}
        </li>
      ))}
    </ul>
  );
}
