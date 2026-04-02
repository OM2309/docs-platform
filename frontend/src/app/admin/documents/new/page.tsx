import type { Metadata } from "next";
import DocEditor from "@/src/components/admin/DocEditor";

export const metadata: Metadata = { title: "New Document" };

export default function NewDocumentPage() {
  return <DocEditor />;
}
