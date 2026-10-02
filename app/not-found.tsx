import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-white px-6 text-[#0d0d0d]">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-[#202123]">
          Page not found
        </h1>
        <p className="mt-3 text-sm leading-6 text-[#5f6368]">
          That page does not exist.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex rounded-full bg-[#0d0d0d] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#303030] focus:outline-none focus-visible:ring-4 focus-visible:ring-black/20"
        >
          Back to AskCursor
        </Link>
      </div>
    </main>
  );
}
