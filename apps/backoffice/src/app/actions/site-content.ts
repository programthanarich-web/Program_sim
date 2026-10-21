"use server";

import { randomUUID } from "node:crypto";
import {
  DEFAULT_SITE_CONTENT,
  parseSiteContent,
  repoImagePath,
  SITE_CONTENT_FILE,
  type SiteContent,
} from "@pt/shared/site-content";
import {
  GitHubContentError,
  readSiteContentFile,
  repoPathForConfig,
  storefrontPrefix,
  writeRepoFile,
} from "@/lib/github-content";
import { sniffSiteImageExtension, type SiteImageExtension } from "@/lib/site-image";
import { requireAdmin } from "@/services/admin";
import type { AdminActionState } from "@/types/admin";

const IMAGE_MAX_BYTES = 1.5 * 1024 * 1024;

function parseCurrent(raw: string | null): SiteContent {
  if (!raw) return DEFAULT_SITE_CONTENT;
  try {
    const parsed = parseSiteContent(JSON.parse(raw));
    return parsed.ok ? parsed.value : DEFAULT_SITE_CONTENT;
  } catch {
    return DEFAULT_SITE_CONTENT;
  }
}

function messageFor(error: unknown): string {
  if (error instanceof GitHubContentError) return error.message;
  if (error instanceof Error && error.message === "เฉพาะผู้ดูแลระบบเท่านั้น") return error.message;
  return "บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง";
}

/**
 * บันทึกเนื้อหาหน้าบ้านลง repo (ผู้ดูแลระบบเท่านั้น)
 * ลำดับ: ตรวจทุกอย่างก่อน → อัปโหลดรูป → เขียน JSON
 * การ commit ไป branch หลักจะทำให้ Vercel deploy หน้าบ้านใหม่อัตโนมัติ
 */
export async function saveSiteContentAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    await requireAdmin();

    const current = await readSiteContentFile();
    const expectedSha = String(formData.get("expectedSha") ?? "");
    if ((current?.sha ?? "") !== expectedSha) {
      return { ok: false, message: "มีการแก้ไขจากคนอื่นก่อนหน้า กรุณาโหลดหน้าใหม่แล้วแก้อีกครั้ง" };
    }

    const text = (key: string) => String(formData.get(key) ?? "");
    const removeImage = formData.get("removeHeroImage") === "on";
    const upload = formData.get("heroImage");
    const hasUpload = upload instanceof File && upload.size > 0;

    // 1) ตรวจไฟล์รูปก่อน (ยังไม่แตะ GitHub)
    let imageBuffer: Buffer | null = null;
    let imageExtension: SiteImageExtension | null = null;
    if (hasUpload) {
      if (upload.size > IMAGE_MAX_BYTES) {
        return { ok: false, message: "รูปหน้าแรกต้องมีขนาดไม่เกิน 1.5 MB" };
      }
      imageBuffer = Buffer.from(await upload.arrayBuffer());
      imageExtension = sniffSiteImageExtension(imageBuffer);
      if (!imageExtension) {
        return { ok: false, message: "ไฟล์รูปต้องเป็น PNG, JPEG หรือ WebP ที่ถูกต้อง" };
      }
    }

    // 2) กำหนด path รูปสุดท้ายและตรวจข้อความทั้งหมดก่อนอัปโหลดจริง (กันไฟล์กำพร้าใน repo)
    const newPublicImage =
      imageBuffer && imageExtension ? `/site/hero-${randomUUID().slice(0, 8)}.${imageExtension}` : null;
    const heroImagePath = removeImage ? "" : (newPublicImage ?? parseCurrent(current?.text ?? null).heroImagePath);

    const parsed = parseSiteContent({
      heroTitle: text("heroTitle"),
      heroSubtitle: text("heroSubtitle"),
      ctaLabel: text("ctaLabel"),
      footerNote: text("footerNote"),
      lineUrl: text("lineUrl"),
      heroImagePath,
      steps: [0, 1, 2].map((i) => ({ title: text(`stepTitle${i}`), description: text(`stepDescription${i}`) })),
    });
    if (!parsed.ok) return { ok: false, message: parsed.error };

    // 3) อัปโหลดรูปใหม่ (ถ้ามี)
    if (imageBuffer && imageExtension && newPublicImage) {
      const imagePath = repoImagePath(storefrontPrefix(), newPublicImage);
      if (!imagePath.ok) return { ok: false, message: imagePath.error };
      await writeRepoFile({
        repoPath: imagePath.value,
        base64: imageBuffer.toString("base64"),
        message: `content: add storefront hero image ${newPublicImage.slice("/site/".length)}`,
      });
    }

    // 4) เขียนไฟล์เนื้อหา โดยอ้าง sha เดิมเพื่อกันการเขียนทับ
    const json = `${JSON.stringify(parsed.value, null, 2)}\n`;
    await writeRepoFile({
      repoPath: repoPathForConfig(SITE_CONTENT_FILE),
      base64: Buffer.from(json, "utf8").toString("base64"),
      message: "content: update storefront copy",
      sha: current?.sha,
    });

    return { ok: true, message: "บันทึกแล้ว หน้าบ้านจะอัปเดตหลัง deploy เสร็จ ประมาณ 1–3 นาที" };
  } catch (error) {
    return { ok: false, message: messageFor(error) };
  }
}
