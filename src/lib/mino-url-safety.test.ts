import { describe, expect, it } from "vitest";
import { checkPublicUrl, findSiteUrl, isPrivateIp } from "./mino-url-safety";
import { assertPublicHost, safeFetch } from "./mino-site-fetch";

describe("isPrivateIp", () => {
  it("flags private, loopback, link-local and reserved IPv4", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "255.255.255.255"]) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
  });
  it("lets public IPv4 through", () => {
    for (const ip of ["8.8.8.8", "172.32.0.1", "93.184.216.34", "1.1.1.1"]) expect(isPrivateIp(ip), ip).toBe(false);
  });
  it("handles IPv6, including IPv4-mapped addresses", () => {
    for (const ip of ["::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "::ffff:7f00:1", "[::1]", "ff02::1"]) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
    expect(isPrivateIp("2606:4700:4700::1111")).toBe(false);
    expect(isPrivateIp("::ffff:8.8.8.8")).toBe(false);
  });
  it("refuses what it cannot parse", () => {
    expect(isPrivateIp("not-an-ip")).toBe(true);
  });
});

describe("checkPublicUrl", () => {
  it("accepts public http(s) sites", () => {
    expect(checkPublicUrl("https://www.sezane.com/fr").ok).toBe(true);
    expect(checkPublicUrl("http://shop.example.fr:443/p").ok).toBe(true);
  });
  it("blocks other protocols, credentials and odd ports", () => {
    expect(checkPublicUrl("file:///etc/passwd")).toMatchObject({ ok: false, reason: "protocol" });
    expect(checkPublicUrl("ftp://example.com")).toMatchObject({ ok: false, reason: "protocol" });
    expect(checkPublicUrl("javascript:alert(1)")).toMatchObject({ ok: false, reason: "protocol" });
    expect(checkPublicUrl("https://user:pass@example.com")).toMatchObject({ ok: false, reason: "credentials" });
    expect(checkPublicUrl("http://example.com:8080")).toMatchObject({ ok: false, reason: "port" });
  });
  it("blocks internal hosts and IP tricks (SSRF)", () => {
    for (const url of [
      "http://localhost/",
      "http://app.localhost",
      "http://127.0.0.1/admin",
      "http://169.254.169.254/latest/meta-data/",
      "http://10.0.0.5",
      "http://[::1]/",
      "http://[::ffff:127.0.0.1]/",
      "http://2130706433/", // decimal 127.0.0.1
      "http://0x7f000001/", // hex 127.0.0.1
      "http://0177.0.0.1/", // octal
      "http://printer.local/",
      "http://metadata.internal/",
      "http://intranet/",
    ]) {
      expect(checkPublicUrl(url), url).toMatchObject({ ok: false, reason: "private" });
    }
  });
  it("treats social profiles apart (they are creators, not a brand site)", () => {
    expect(checkPublicUrl("https://www.tiktok.com/@brand")).toMatchObject({ ok: false, reason: "social" });
    expect(checkPublicUrl("https://www.tiktok.com/@brand", { allowSocial: true }).ok).toBe(true);
  });
});

describe("findSiteUrl", () => {
  it("finds a site written with or without the scheme", () => {
    expect(findSiteUrl("Voici mon site : monshop.fr, trouve des créatrices")).toBe("https://monshop.fr/");
    expect(findSiteUrl("check https://www.brand.com/products/x?y=1.")).toBe("https://www.brand.com/products/x?y=1");
  });
  it("ignores emails, files, social links and private hosts", () => {
    expect(findSiteUrl("écrivez à hello@brand.com")).toBeNull();
    expect(findSiteUrl("voir photo.png")).toBeNull();
    expect(findSiteUrl("https://instagram.com/brand")).toBeNull();
    expect(findSiteUrl("http://192.168.0.1")).toBeNull();
    expect(findSiteUrl("trouve des créatrices beauté en France")).toBeNull();
  });
});

describe("assertPublicHost", () => {
  const resolver = (addresses: string[]) => (async () => addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }))) as never;

  it("refuses a public name that resolves to a private address", async () => {
    await expect(assertPublicHost("evil.example", resolver(["93.184.216.34", "127.0.0.1"]))).rejects.toMatchObject({ code: "blocked" });
    await expect(assertPublicHost("evil.example", resolver(["::1"]))).rejects.toMatchObject({ code: "blocked" });
  });
  it("accepts a name that only resolves to public addresses", async () => {
    await expect(assertPublicHost("example.com", resolver(["93.184.216.34"]))).resolves.toBeUndefined();
  });
  it("safeFetch refuses private targets before any request", async () => {
    await expect(safeFetch("http://127.0.0.1:80/")).rejects.toMatchObject({ code: "blocked" });
    await expect(safeFetch("gopher://example.com")).rejects.toMatchObject({ code: "blocked" });
  });
});
