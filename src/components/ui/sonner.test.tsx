import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { Toaster } from "./sonner"

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light" }),
}))

vi.mock("sonner", () => ({
  Toaster: ({ position }: { position?: string }) => (
    <div data-testid="sonner-toaster" data-position={position} />
  ),
}))

describe("Toaster", () => {
  it("uses top-center globally so notifications do not cover bottom action bars", () => {
    render(<Toaster />)

    expect(screen.getByTestId("sonner-toaster"))
      .toHaveAttribute("data-position", "top-center")
  })

  it("allows an explicit position override for exceptional layouts", () => {
    render(<Toaster position="top-right" />)

    expect(screen.getByTestId("sonner-toaster"))
      .toHaveAttribute("data-position", "top-right")
  })
})
