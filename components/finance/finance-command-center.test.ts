import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../..");

describe("Finance Command Center layout", () => {
  it("uses the cc2 shell on the finance page", () => {
    const pageSource = readFileSync(resolve(ROOT, "app/finance/page.tsx"), "utf8");

    expect(pageSource).toContain(
      'mainClassName="app-main--command-center cc2-shell"',
    );
  });

  it("renders the redesigned dashboard sections", () => {
    const componentSource = readFileSync(
      resolve(ROOT, "components/finance/finance-command-center.tsx"),
      "utf8",
    );

    expect(componentSource).toContain("FinanceHeader");
    expect(componentSource).toContain("FinancePrimaryMetrics");
    expect(componentSource).toContain("FinanceSecondaryMetrics");
    expect(componentSource).toContain("FinanceConnectionStrip");
    expect(componentSource).toContain("FinanceAlertsPanel");
    expect(componentSource).toContain("FinanceCategoryPanel");
    expect(componentSource).toContain("FinanceAccountsTable");
  });

  it("does not render Recent Transactions on the primary dashboard", () => {
    const componentSource = readFileSync(
      resolve(ROOT, "components/finance/finance-command-center.tsx"),
      "utf8",
    );

    expect(componentSource).not.toContain("Recent transactions");
    expect(componentSource).not.toContain("FinanceTransactionsSection");
  });

  it("uses accurate business exclusion copy in the header", () => {
    const headerSource = readFileSync(
      resolve(ROOT, "components/finance/finance-header.tsx"),
      "utf8",
    );

    expect(headerSource).toContain(
      "Monthly totals exclude transactions classified as business.",
    );
  });

  it("stacks header actions beneath the subtitle on the left", () => {
    const headerSource = readFileSync(
      resolve(ROOT, "components/finance/finance-header.tsx"),
      "utf8",
    );

    expect(headerSource).toContain("finance-header-descriptor");
    expect(headerSource).toContain("finance-header-actions");
    expect(headerSource.indexOf("finance-header-descriptor")).toBeLessThan(
      headerSource.indexOf("finance-header-actions"),
    );
    expect(headerSource).not.toContain("finance-header-main");
  });

  it("adds finance-only top breathing room in CSS", () => {
    const css = readFileSync(resolve(ROOT, "app/globals.css"), "utf8");

    expect(css).toMatch(/\.jv-page-content--finance[\s\S]*padding-top:\s*1\.625rem/);
  });

  it("defines primary and secondary metric card grids in CSS", () => {
    const css = readFileSync(resolve(ROOT, "app/globals.css"), "utf8");

    expect(css).toContain(".finance-hero-grid");
    expect(css).toContain(".finance-secondary-grid");
    expect(css).toContain(".finance-connection-strip");
    expect(css).toContain(".finance-content-grid");
    expect(css).toContain(".finance-panel");
  });
});
