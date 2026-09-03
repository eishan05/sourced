import { useField } from "../context";

export interface IssuesProps {
  fieldId: string;
  className?: string;
}

export function Issues({ fieldId, className }: IssuesProps) {
  const field = useField(fieldId);
  if (field.issues.length === 0) return null;

  return (
    <ul className={className} id={`${fieldId}-issues`}>
      {field.issues.map((issue) => (
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
