import type { ComponentType } from "react";
import { Composition } from "remotion";
import { ShortVideoComposition } from "./compositions/ShortVideo.js";
import { PosterSlideshow } from "./compositions/PosterSlideshow.js";
import { MotivationalQuote } from "./compositions/MotivationalQuote.js";
import { ProductShowcase } from "./compositions/ProductShowcase.js";
import { NewsBreaker } from "./compositions/NewsBreaker.js";
import { RedditStory } from "./compositions/RedditStory.js";
import { FinanceTip } from "./compositions/FinanceTip.js";
import { CountdownList } from "./compositions/CountdownList.js";

type LooseComponent = ComponentType<Record<string, unknown>>;

export const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="ShortVideo"
        component={ShortVideoComposition as unknown as LooseComponent}
        durationInFrames={450}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          topic: "Default Topic",
          script: [],
          backgroundStyle: "dark_gradient",
          niche: "general",
        }}
      />
      <Composition
        id="PosterSlideshow"
        component={PosterSlideshow as unknown as LooseComponent}
        durationInFrames={180}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{ images: [], captions: [] }}
      />
      <Composition
        id="MotivationalQuote"
        component={MotivationalQuote as unknown as LooseComponent}
        durationInFrames={150}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{ quote: "", author: "", background: "dark_luxury" }}
      />
      <Composition
        id="ProductShowcase"
        component={ProductShowcase as unknown as LooseComponent}
        durationInFrames={300}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          productName: "",
          features: [],
          imageUrl: "",
          price: "",
        }}
      />
      <Composition
        id="NewsBreaker"
        component={NewsBreaker as unknown as LooseComponent}
        durationInFrames={270}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{ headline: "", summary: "", imageUrl: "" }}
      />
      <Composition
        id="RedditStory"
        component={RedditStory as unknown as LooseComponent}
        durationInFrames={600}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{ title: "", body: "", subreddit: "" }}
      />
      <Composition
        id="FinanceTip"
        component={FinanceTip as unknown as LooseComponent}
        durationInFrames={240}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{ tip: "", data: [] }}
      />
      <Composition
        id="CountdownList"
        component={CountdownList as unknown as LooseComponent}
        durationInFrames={300}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{ title: "", items: [] }}
      />
    </>
  );
};
