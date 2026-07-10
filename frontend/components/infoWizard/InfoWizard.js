"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { H3, Body } from "@leafygreen-ui/typography";
import Icon from "@leafygreen-ui/icon";
import Image from "next/image";
import Button from "@leafygreen-ui/button";
import { Tabs, Tab } from "@leafygreen-ui/tabs";
import { TALK_TRACK } from "@/lib/const/talkTrack";

const InfoWizard = ({
  tooltipText = "Learn more",
  iconGlyph = "Wizard",
  sections = TALK_TRACK,
}) => {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(0);

  // Close on Escape + lock background scroll while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <Button
        style={{ margin: "5px" }}
        onClick={() => setOpen((prev) => !prev)}
        leftGlyph={<Icon glyph={iconGlyph} />}
        title={tooltipText}
      >
        Tell me more!
      </Button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,30,43,0.5)] p-6"
            onClick={() => setOpen(false)}
          >
            <div
              className="relative flex h-[75vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
              role="dialog"
              aria-modal="true"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              >
                <Icon glyph="X" />
              </button>

              <div className="flex-1 overflow-y-auto p-7">
              <Tabs
                aria-label="info wizard tabs"
                setSelected={setSelected}
                selected={selected}
              >
                {sections.map((tab, tabIndex) => (
                  <Tab key={tabIndex} name={tab.heading}>
                    {tab.content.map((section, sectionIndex) => (
                      <div key={sectionIndex} className="mb-4">
                        {section.heading && (
                          <H3 style={{ marginTop: "20px", marginBottom: "10px" }}>
                            {section.heading}
                          </H3>
                        )}
                        {section.body &&
                          (Array.isArray(section.body) ? (
                            <ul className="list-disc pl-6">
                              {section.body.map((item, idx) =>
                                typeof item == "object" ? (
                                  <li key={idx}>
                                    {item.heading}
                                    <ul className="list-disc pl-6">
                                      {item.body?.map((subItem, i) => (
                                        <li key={i}>
                                          <Body>{subItem}</Body>
                                        </li>
                                      ))}
                                    </ul>
                                  </li>
                                ) : (
                                  <li key={idx}>
                                    <Body>{item}</Body>
                                  </li>
                                )
                              )}
                            </ul>
                          ) : (
                            <Body>{section.body}</Body>
                          ))}

                        {section.image && (
                          <div className="relative flex h-[400px] w-full items-center justify-center">
                            <Image
                              src={section.image.src}
                              alt={section.image.alt}
                              fill
                              sizes="(max-width: 768px) 90vw, 700px"
                              style={{ objectFit: "contain", objectPosition: "center" }}
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </Tab>
                ))}
              </Tabs>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};

export default InfoWizard;
