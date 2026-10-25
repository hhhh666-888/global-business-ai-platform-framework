import { expect, test } from "@playwright/test";

test("Atomic-derived source renders as native GBAP UI without external runtime dependency", async ({ page }) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== "http://127.0.0.1:4173") externalRequests.push(request.url());
  });

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "GBAP CRM" })).toBeVisible();
  await expect(page.getByText("Native UI source-reuse PoU")).toBeVisible();
  await expect(page.getByTestId("source-provenance")).toContainText("167a4cdb652b");
  await expect(page.getByTestId("account-card")).toHaveCount(3);
  await expect(page.locator("iframe")).toHaveCount(0);

  await page.getByTestId("pipeline-tab").click();
  await expect(page.getByTestId("pipeline")).toBeVisible();
  await expect(page.getByTestId("opportunity-card")).toHaveCount(4);

  await page.getByTestId("opportunity-card").first().click();
  await expect(page.getByTestId("opportunity-detail")).toContainText("Solar + BESS retrofit");
  await expect(page.getByTestId("opportunity-detail")).toContainText("Andes Plastics");

  expect(externalRequests).toEqual([]);
});
