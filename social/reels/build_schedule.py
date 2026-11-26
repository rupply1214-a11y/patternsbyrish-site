"""Builds social/reels/schedule.json (captions + order) for the reel batch."""
import json,re
BASE="https://rupply1214-a11y.github.io/patternsbyrish-site/static/reels/"
SHOP="https://patternsbyrish.etsy.com"
def L(i,slug): return f"https://patternsbyrish.etsy.com/listing/{i}/{slug}"
TAGS={
 "vintage":"#vintagesewingmachine #singersewingmachine #antiquesewingmachine #sewing #sewinglove #sewingreels #vintagesewing #sewingmachine #handmade #pdfsewingpattern",
 "asmr":"#sewingasmr #asmr #tailoring #sewing #sewingreels #satisfyingvideos #sewingprocess #handmade #sewist #pdfsewingpattern",
 "dress":"#sewingpattern #pdfsewingpattern #dressmaking #sewing #sewingreels #memade #handmadewardrobe #sewist #isew #diyfashion",
 "xmas":"#christmasdress #christmassewing #holidaysewing #sewingpattern #pdfsewingpattern #dressmaking #sewingreels #memade #handmadechristmas #sewist",
 "journey":"#fabric #slowfashion #sustainablefashion #fromscratch #sewing #sewingreels #handmade #textile #memade #pdfsewingpattern",
 "mini":"#miniatureworld #tinyworld #sewing #sewingmachine #sewingreels #satisfying #sewingfun #handmade #sewist #pdfsewingpattern",
}
# label, date, hook, body, tagset, link (or None), link_label
R=[
("RL01_VintageSinger_Rain","2026-11-26","This 100-year-old Singer still sews better than most new machines 🧵","Rain outside, oil lamp on, and plaid wool under the needle. Some sounds never get old.","vintage",None,None),
("RL07_Miniature_TinyTailors","2026-11-27","Tiny tailors, giant job 🪡","When the thread spool is bigger than the whole team, you call everyone in.","mini",None,None),
("RL02_ASMR_BW_ChalkLine","2026-11-28","The most satisfying sound in tailoring ✍️","Chalk on wool. One line, and the whole garment starts here.","asmr",None,None),
("RL16_BurgundyGown_Runway","2026-11-29","From a pile of burgundy crepe to this 😍","Cut, draped, stitched and ready for the spotlight. This one shoulder evening gown is a PDF sewing pattern you can make at home.","dress",L("4530267030","one-shoulder-evening-gown-sewing-pattern"),"One Shoulder Evening Gown pattern"),
("RL05_VintageTreadle_Grandma","2026-11-30","No electricity. No problem. 🌿","An old treadle machine, sunlight and floral cotton. This is how our grandmothers sewed.","vintage",None,None),
("RL04_Wool_SheepToCoat","2026-12-01","From sheep to coat in 10 seconds 🐑➡️🧥","Wool, yarn, fabric, pattern pieces, and finally a tailored coat. Every garment has a story.","journey",None,None),
("RL08_ASMR_NeedleThread","2026-12-02","Turn your sound on 🔊","Threading, winding, pins and steam. Pure sewing ASMR.","asmr",None,None),
("RL06_Sketch_WeddingGown","2026-12-03","From a pencil sketch to her wedding day 🤍","Sketch, satin, lace and a long walk across the field. You can sew a gown like this with our wedding dress PDF pattern.","dress",L("4602145557","wedding-dress-sewing-pattern-pdf"),"Wedding Dress pattern"),
("RL09_VintageSinger_Restore","2026-12-04","A rusty attic Singer gets a second life… wait for it ✨","A little cleaning, a drop of oil and it stitches like new again.","vintage",None,None),
("RL15_Miniature_NeedleRepair","2026-12-05","Needle broke? Call the emergency team 🚒🪡","The tiniest repair crew in the sewing room never misses a deadline.","mini",None,None),
("RL13_ASMR_BW_SuitMaking","2026-12-06","How a tailored jacket is really made 🖤","Measure, cut, press, finish. Old-school tailoring in black and white.","asmr",None,None),
("RL03_Atelier_EmeraldGown","2026-12-07","Sew your own Christmas gown this year 🎄💚","Emerald satin, a few seams and a spin you will remember. Our Christmas dress bundle has this halter maxi gown as a PDF pattern.","xmas",L("4610317552","christmas-dress-sewing-pattern-bundle"),"Christmas Dress Bundle"),
("RL17_VintageMachines_Market","2026-12-08","Which vintage machine would you take home? 💚","A whole row of antique sewing machines at the flea market. We would take the mint green one.","vintage",None,None),
("RL11_Cotton_FieldToDress","2026-12-09","From cotton field to dress 🤍","Picked, spun, woven and sewn into a flowing white dress. Slow fashion at its best.","journey",None,None),
("RL18_ASMR_PatternTracing","2026-12-10","How to use a PDF sewing pattern ✂️","Tape the pages, trace the lines, cut the pieces, and you are ready to sew. This is exactly how our patterns work.","asmr",SHOP,"Shop PDF sewing patterns"),
("RL19_Velvet_SnowStreet","2026-12-11","Velvet season is here ❄️","Burgundy velvet, snowy streets and Christmas lights. Sew a dress that feels like winter.","xmas",None,None),
("RL21_VintageMachine_1950sShop","2026-12-12","Step into a 1950s dress shop 🎀","Mint green machines, pink gingham and a swing dress on the rail. Pure nostalgia.","vintage",None,None),
("RL24_Miniature_FabricCity","2026-12-13","All aboard the fabric express 🚂🧵","Spool towers, measuring tape tracks and a train full of fabric rolls.","mini",None,None),
("RL22_ASMR_BW_Buttonholes","2026-12-14","The button sound at the end 🔘","Buttonholes, a seam ripper and one perfect button. Sound on.","asmr",None,None),
("RL10_GreenWrapDress_Spin","2026-12-15","Your Christmas dress, made by you 🎄","Green with tiny gold dots, a wrap neckline and a skirt made for spinning. This wrap dress is a PDF sewing pattern in sizes XS to 5XL.","xmas",L("4600739599","wrap-dress-sewing-pattern-pdf-surplice-v"),"Wrap Dress pattern"),
("RL26_Workshop1920_Sepia","2026-12-16","A 1920s tailor workshop, brought back to life 🕰️","Black machines, a steaming iron and a waistcoat finished by hand.","vintage",None,None),
("RL20_Linen_FlaxToDress","2026-12-17","Did you know linen comes from this flower? 💙","Flax, fibre, thread, fabric and a simple linen dress.","journey",None,None),
("RL14_Kids_ChristmasDress","2026-12-18","She waited all year for this Christmas dress 🎄❤️","A burgundy pinafore sewn at home, and the twirl says it all. Our girls dress bundle has this pinafore, ages 2 to 16.","xmas",L("4620845054","girls-dress-sewing-pattern-bundle-pdf-3"),"Girls Dress Bundle"),
("RL27_ASMR_FirstStitch","2026-12-19","Your first sewing project starts like this 🤍","Light on, needle threaded, one straight line, and you made something. Every sewist remembers this moment.","asmr",None,None),
("RL12_VintageMachine_Snow","2026-12-20","Christmas Eve sewing on a hand-crank machine 🎄","Snow outside, fire inside and a red velvet stocking made by hand.","vintage",None,None),
("RL25_Embroidery_GownDetail","2026-12-21","Every pearl sewn by hand ✨","Lilac tulle, pearls and sequins, then the reveal on stage.","dress",None,None),
("RL28_Wool_ScarfToGift","2026-12-22","The best gift is the one you made 🎁","Red plaid wool, a few cuts and a scarf wrapped for someone you love.","xmas",None,None),
("RL29_GiantMachine_Desert","2026-12-23","They found a giant sewing machine in the desert… 🏜️","And then the wheel started to turn. Would you go closer?","vintage",None,None),
("RL23_Family_MatchingXmas","2026-12-24","Matching Christmas outfits, all handmade 🎄","Plaid flannel, a few evenings of sewing and a family photo to keep forever. Our Christmas outfit bundle has 5 patterns for the whole family.","xmas",L("4610232175","christmas-outfit-sewing-pattern-bundle"),"Christmas Outfit Bundle"),
("RL30_Sequin_NewYear","2026-12-31","New Year's Eve outfit idea ✨🎆","Green sequins, a pink glitter circle skirt and fireworks at midnight. This two piece set is a PDF sewing pattern.","dress",SHOP,"Shop PDF sewing patterns"),
]
out=[]
for lab,d,hook,body,ts,link,ll in R:
    k=lab.split('_')[0]
    cap=f"{hook}\n\n{body}\n\n🧵 PDF sewing patterns in sizes XS–5XL by PatternsByRish. Link in bio.\n\nWould you sew this? Tell us below 👇\n\n{TAGS[ts]}"
    fbtags=' '.join(TAGS[ts].split()[:6])
    fb=f"{hook}\n\n{body}\n\n🛒 {ll or 'Shop PDF sewing patterns'}: {link or SHOP}\n\nWould you sew this? Tell us below 👇\n\n{fbtags}"
    out.append(dict(date=d,label=lab,video=BASE+k+".mp4",cover=BASE+k+".jpg",thumb_offset=8600,caption=cap,fb_caption=fb,link=link or SHOP,title=hook))
assert len({o['date'] for o in out})==len(out)
json.dump(out,open('social/reels/schedule.json','w'),indent=1,ensure_ascii=False)
print(len(out)); print(out[3]['caption']); print('---'); print(out[3]['fb_caption'])
