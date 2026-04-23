/**
 * LicensePage — MIT license text for BChemXtractWeb plus third-party
 * attributions for the major runtime components whose licenses require
 * notice (CDK / LGPL) or are customary to cite (upstream BChemXtract).
 *
 * Sourced from:
 *   - /LICENSE at the repo root (BChemXtractWeb MIT)
 *   - backend/lib/bchemxtract/LICENSE (upstream BChemXtract MIT)
 *   - https://github.com/cdk/cdk/blob/main/LICENSE.txt (CDK 2.12 LGPL-2.1-or-later)
 *
 * The complete dependency list lives in frontend/package.json and
 * backend/requirements.txt; this page cites the load-bearing licenses
 * and links out for the full manifest.
 */
import { ArrowUpRightIcon, ScaleIcon } from "lucide-react";

import { PageContainer } from "@/components/layout/PageContainer";
import { LEGAL_LINK_CLASS, LegalPageHeader } from "@/pages/legalShared";
import { cn } from "@/lib/utils";

const MIT_LICENSE_TEXT = `MIT License

Copyright (c) 2026 Beilstein Institute for the Advancement of Chemical Sciences

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

interface ThirdPartyEntry {
  name: string;
  href: string;
  spdx: string;
  note: string;
}

const THIRD_PARTY: ThirdPartyEntry[] = [
  {
    name: "BChemXtract",
    href: "https://github.com/Beilstein-Institut/BChemXtract",
    spdx: "MIT",
    note: "Pure-Java ChemDraw extractor. Bundled in backend/jars/ at build time. © 2025 Beilstein Institute for the Advancement of Chemical Sciences.",
  },
  {
    name: "Chemistry Development Kit (CDK 2.12)",
    href: "https://cdk.github.io/",
    spdx: "LGPL-2.1-or-later",
    note: "Descriptor engine bundled inside the BChemXtract fat JAR. CDK is linked, not modified; dynamic linking is permitted by the LGPL. Source remains available upstream.",
  },
  {
    name: "React",
    href: "https://react.dev/",
    spdx: "MIT",
    note: "UI framework for the frontend SPA.",
  },
  {
    name: "FastAPI",
    href: "https://fastapi.tiangolo.com/",
    spdx: "MIT",
    note: "Python web framework for the backend API.",
  },
  {
    name: "JPype",
    href: "https://jpype.readthedocs.io/",
    spdx: "Apache-2.0",
    note: "Python ↔ JVM bridge that loads BChemXtract at backend startup.",
  },
  {
    name: "Tailwind CSS",
    href: "https://tailwindcss.com/",
    spdx: "MIT",
    note: "Utility-first styling for the frontend design system.",
  },
  {
    name: "Base UI",
    href: "https://base-ui.com/",
    spdx: "MIT",
    note: "Headless primitives behind most frontend components.",
  },
  {
    name: "Lucide",
    href: "https://lucide.dev/",
    spdx: "ISC",
    note: "Iconography used throughout the frontend.",
  },
  {
    name: "JetBrains Mono",
    href: "https://www.jetbrains.com/lp/mono/",
    spdx: "OFL-1.1",
    note: "The single webfont family used for display, body, and chemistry data rendering.",
  },
];

export function LicensePage() {
  return (
    <PageContainer data-slot="license-page">
      <LegalPageHeader
        icon={<ScaleIcon aria-hidden="true" className="size-3.5" />}
        eyebrow="License"
        title="Open source under the MIT License"
        lede="BChemXtractWeb is released under the MIT License. You are free to use, modify, and redistribute the software subject to the notice below. Third-party components retain their own licenses, listed further down."
      />

      <section
        aria-labelledby="license-mit-heading"
        className="mt-10 rounded-lg border border-border bg-surface p-6 sm:p-8"
        data-slot="license-mit"
      >
        <h2
          id="license-mit-heading"
          className="text-lg font-semibold text-foreground"
        >
          BChemXtractWeb — MIT License
        </h2>
        <p className="mt-1 text-caption text-foreground-muted">
          Verbatim reproduction of the{" "}
          <a
            href="https://github.com/Beilstein-Institut/BChemXtractWeb/blob/main/LICENSE"
            target="_blank"
            rel="noreferrer"
            className={LEGAL_LINK_CLASS}
          >
            LICENSE file at the repository root
          </a>
          .
        </p>
        <pre
          className="mt-5 overflow-x-auto rounded-md border border-border bg-surface-muted p-4 font-mono text-[0.8125rem] leading-relaxed text-foreground whitespace-pre-wrap break-words"
          data-slot="license-mit-text"
        >
          {MIT_LICENSE_TEXT}
        </pre>
      </section>

      <section
        aria-labelledby="license-third-party-heading"
        className="mt-10"
        data-slot="license-third-party"
      >
        <h2
          id="license-third-party-heading"
          className="text-lg font-semibold text-foreground"
        >
          Third-party components
        </h2>
        <p className="mt-1 max-w-[70ch] text-sm text-foreground-muted">
          Load-bearing dependencies and their licenses. The complete manifest
          for the frontend is in{" "}
          <a
            href="https://github.com/Beilstein-Institut/BChemXtractWeb/blob/main/frontend/package.json"
            target="_blank"
            rel="noreferrer"
            className={LEGAL_LINK_CLASS}
          >
            frontend/package.json
          </a>{" "}
          and for the backend in{" "}
          <a
            href="https://github.com/Beilstein-Institut/BChemXtractWeb/blob/main/backend/requirements.txt"
            target="_blank"
            rel="noreferrer"
            className={LEGAL_LINK_CLASS}
          >
            backend/requirements.txt
          </a>
          .
        </p>
        <ul
          className="mt-5 flex flex-col gap-3"
          data-slot="license-third-party-list"
        >
          {THIRD_PARTY.map((entry) => (
            <li
              key={entry.href}
              className="rounded-lg border border-border bg-surface p-4 sm:p-5"
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <a
                  href={entry.href}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sm font-medium text-foreground hover:text-primary hover:underline underline-offset-2"
                >
                  {entry.name}
                  <ArrowUpRightIcon aria-hidden="true" className="size-3.5" />
                </a>
                <span
                  className="rounded-md border border-border bg-surface-muted px-2 py-0.5 font-mono text-[0.7rem] tracking-wide text-foreground-muted"
                  aria-label={`License: ${entry.spdx}`}
                >
                  {entry.spdx}
                </span>
              </div>
              <p className="mt-1.5 text-caption leading-relaxed text-foreground-muted">
                {entry.note}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-labelledby="license-cdk-notice-heading"
        className="mt-10 rounded-lg border border-border bg-surface-elevated p-6 sm:p-8"
        data-slot="license-cdk-notice"
      >
        <h2
          id="license-cdk-notice-heading"
          className="text-lg font-semibold text-foreground"
        >
          CDK — LGPL notice
        </h2>
        <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-foreground-muted">
          BChemXtractWeb ships with the Chemistry Development Kit (CDK 2.12)
          bundled inside the BChemXtract fat JAR. CDK is distributed under the
          GNU Lesser General Public License, version 2.1 or later. CDK is
          dynamically linked by the BChemXtract library; it is not modified.
          The full, unmodified CDK source is available from the upstream
          project.
        </p>
        <p className="mt-3 text-sm">
          <a
            href="https://github.com/cdk/cdk"
            target="_blank"
            rel="noreferrer"
            className={cn("inline-flex items-center gap-1", LEGAL_LINK_CLASS)}
          >
            CDK source on GitHub
            <ArrowUpRightIcon aria-hidden="true" className="size-3.5" />
          </a>
        </p>
      </section>
    </PageContainer>
  );
}
