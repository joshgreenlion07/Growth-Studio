/**
 * Belgard's own product page, listed sizes and swatch photo for every line and color in the catalog, collected from
 * belgard.com product pages (the swatch picker's full-size image for each color). The photos are not copied into the
 * app: the material panel loads them live from belgard.com by this address, so one that Belgard moves stops showing
 * (the panel falls back to the color swatch). Generated; re-collect when Belgard changes its pages.
 */
export interface MakerMedia {
  page: string;
  /** Sizes as Belgard lists them, with thickness. */
  sizes: string[];
  /** Color name -> swatch photo path under IMAGE_BASE (or a full URL). */
  images: Record<string, string>;
}

export const IMAGE_BASE = 'https://www.belgard.com/wp-content/uploads/sites/2/';

export const BELGARD_MEDIA: Record<string, MakerMedia> = {
  "Catalina Grana": {
    page: "https://www.belgard.com/product/catalina-grana-paver/",
    sizes: ["6 x 12 x 2 3/8\" / 9 x 12 x 2 3/8\" / 12 x 12 x 2 3/8\"", "4 x 8 x 2 3/8\" / 8 x 8 x 2 3/8\" / 8 x 12 x 2 3/8\"", "4 x 8 x 1 3/16\" / 8 x 8 x 1 3/16\" / 8 x 12 x 1 3/16\"", "6 x 9 x 2 3/8\""],
    images: { "Amaretto": "372_Amaretto_CM_Catalina_Grana_Modular.jpg", "Anthracite": "75a5af22642b0a61593ca360586267053c5c6811.jpg", "Aspen": "402_Aspen_CM_Catalina_Grana_Modular.jpg", "Bella": "a0cuzppwicscraurjfq2-2.jpg", "Brown Beige Charcoal": "2f5a422ee20538e02d23ac7d244e5653f5b3b0f1.jpg", "Cream Tan Brown": "403_Cream_tan_Brown_DF_Catalina_Grana_Modular.jpg", "Gray Charcoal": "d7d3323a9fbca5ea87a33a07598502a12327db9a.jpg", "Gray Charcoal Tan": "116e3365081a6e0ac01400758875e02364a5e066.jpg", "Hickory": "a211552db4e482cc05d3a0eacc874464cf7d9596.jpg", "Linen": "74503ef0d33f01078814ad133d7e09f2418203ed.jpg", "Midnight": "maprx1iudqjtwuyd8w3z-2.jpg", "Montecito": "401_Montecito_CM_Catalina_Grana_Modular.jpg", "Napoli": "372_Napoli_Catalina_Grana_CM_Modular.jpg", "Rainier": "c361422a961988940b0aba7fb0e8bcbe104a27f4.jpg", "Rio": "401_Rio_CM_Catalina_Grana_Modular.jpg", "Riviera": "402_Riviera_CM_Catalina_Grana_Modular.jpg", "Scandina Gray": "8eba01601e9fa23176c1ea5dda0527e7f4f9ffeb.jpg", "Sepia": "cbf51b8eb14457ab954677f8f5933ca711096e7d.jpg", "Shaded Gray": "vwvigjsfisxwkae1ytwa.jpg", "Sierra": "rvpncq0bcpy2hilrcvki.jpg", "Slate": "372_Slate_Catalina_Grana_CM_Modular.jpg", "Sonoran Gray": "441_Sonoran_Gray_CM_Catalina_Grana_Modular_Web.jpg", "Tan Brown Charcoal": "403_Tan_Brown_Charcoal_Catalina_Grana_Modular.jpg", "Tan Red Charcoal": "61ffed53f235a31f1a1e4c6a19d5c91ba0082415.jpg", "Titanium": "372_Titanium_Catalina_Grana_CM_Modular.jpg", "Toscana": "401_Toscana_CM_Catalina_Grana_Modular.jpg", "Victorian": "0842004af61ad243210a3f6d920f4d88d9c9ab7f.jpg" },
  },
  "Avalon Slate": {
    page: "https://www.belgard.com/product/avalon-slate/",
    sizes: ["6 x 12 x 2 3/8\" / 9 x 12 x 2 3/8\" / 12 x 12 x 2 3/8\"", "6 x 9 x 2 3/8\""],
    images: { "Autumn": "415_Autumn_CM_Avalon_Slate_Modular_Web.jpg", "Bella": "401_Bella_CM_Avalon_Slate_Modular.jpg", "Midnight": "342_Midnight_CM_Avalon_Slate_Modular.jpg", "Rainier": "SS_415_Origin-18_Rainier_Seamless-1.jpg", "Rio": "415_Rio_CM_Avalon_Slate_Modular_Web.jpg", "Sierra": "dqcmue6qe6xy2z9d6xhb-2.jpg", "Sonoran Gray": "441_Sonoran_Gray_CM_Avalon_Slate_Modular_Web-1.jpg", "Toscana": "401_Toscana_CM_Avalon_Slate_Modular.jpg", "Victorian": "z5fdp1xephfe8vok5ni1-2.jpg" },
  },
  "Antiqued Flat Top": {
    page: "https://www.belgard.com/product/antiqued-flat-top/",
    sizes: ["6 x 9 x 2 3/8\" / 9 x 9 x 2 3/8\" / 9 x 12 x 2 3/8\"", "6 x 9 x 2 3/8\""],
    images: { "Cream Tan Brown": "stlzr9xsnfl9jzmku0hy-2.jpg", "Gray Charcoal Tan": "93120ce5a68a525c886e97386135478e55e7f5e2.jpg", "Gray Charcoal": "puiylflzuvkpvsciydrp.jpg", "Midnight": "nh3i0sajpenafrg6bdlt.jpg", "Shaded Gray": "403_NC_Shaded_Gray_DF_Flat-top-Antiqued_Modular.jpg", "Tan Brown Charcoal": "zs8f8b3djogokrjmblkj.jpg" },
  },
  "Dimensions 6": {
    page: "https://www.belgard.com/product/dimensions-6/",
    sizes: ["3 x 6 x 2 3/8\" / 6 x 6 x 2 3/8\" / 6 x 9 x 2 3/8\"", "3 x 6 x 1 3/8\" / 6 x 6 x 1 3/8\" / 6 x 9 x 1 3/8\""],
    images: { "Anthracite": "xhgteujzqoaafgsuwjw6-2.jpg", "Aspen": "c3099f2900b362240baf2fe5d1f373cbd84a8232.jpg", "Avondale": "9aa0aebe4fa261aff4f7db5ebc4feea6c299402e.jpg", "Bella": "c2blum6wo5yj1hi4josw.jpg", "Cheswick": "q3d1kd5p09vfztpi590o-2.jpg", "Danville": "hx2f4jjagvabvdylu5lp-2.jpg", "Dune": "x5dkrnypuyq7v1p4pard.jpg", "Hatteras": "Belgard_Adams_SEPT2022_SWATCH_Dimensions12_HATTERAS.jpg", "Hickory": "db6cd7209bbe02d2d2237541ba0de90f075a2be9.jpg", "Iron Bay": "c6nvtwakhvyu4q3gs5if.jpg", "Lueders Gray": "st39boiugheizks0muzw-2.jpg", "Magnolia": "a4cba62927b20379ef23554bebeee3c66c843704.jpg", "Napoli": "63M_Napoli_CM_D6_Modular_Web.jpg", "Newport Gray": "xk3negyz5acowmqdmizm-2.jpg", "Potomac": "lpkwmlsjn3nryzwnmhdd-2.jpg", "Rio": "sr4w5llnmebr12ifiqve.jpg", "Savannah": "622_Savannah_CM_D18_Modular_Web.jpg", "Scandina Gray": "ywfhw59jryswfokdynxx.jpg", "Scandina Grey": "233_Shaded_Gray_DF_D6_Modular_Web.jpg", "Sepia": "ray8mgz02yhufo77jwgc-2.jpg", "Shaded Gray": "c9gaj756txhn0xoovsg6.jpg", "Sierra": "c83d5e73e7880891a0f0848383bdd621d10db4a2.jpg", "Sonoran Gray": "ab9bbdca31052be09a381fc4ca5afd9539a9e418.jpg", "Victorian": "441_Victorian_CM_D6_Modular_Web.jpg" },
  },
  "Dimensions 12 60mm": {
    page: "https://www.belgard.com/product/dimensions-12-60mm/",
    sizes: ["6 x 12 x 2 3/8\" / 12 x 12 x 2 3/8\" / 12 x 18 x 2 3/8\""],
    images: { "Amber Beige": "2c910cc52c03c3bdff9868e3d37669e73dbfb31f.jpg", "Anthracite": "rvvz4ckp322pxgegeidg-2.jpg", "Ashwood": "1d6838421ec2cfc32a31cef3cdeb7ca508b729fc.jpg", "Aspen": "Belgard_Northfield_W_SEPT2022_SWATCH_Dimensions12_Aspen-1.jpg", "Aspen Blend": "vety0msyogwyzhsvtaba-2.jpg", "Avondale": "9aa0aebe4fa261aff4f7db5ebc4feea6c299402e.jpg", "Bella": "441_Bella_CM_D12_Modular-_Web.jpg", "Cheswick": "rmlstvm9655jygavweli-2.jpg", "Cliffside": "gks5mwowbkwxguolarjg.jpg", "Danville": "27627a1074b4f3f7ed858d2c19dcdf27816f9064.jpg", "Dune": "x5dkrnypuyq7v1p4pard.jpg", "Galway": "380206ce69825230bb59329766132cda2797c924.jpg", "Hatteras": "605_Hatteras_CM_D12_Modular-_Web.jpg", "Hickory": "404_Hickory_DF_D12_Modular-_Web.jpg", "Iron Bay": "anfl7wpr31xy6wmvwllv-2.jpg", "Limestone": "dv47rn9eepc6z3ihwnve.jpg", "Linen": "465_Linen_Beige_CM_D12_Modular.jpg", "Lueders Gray": "527_Lueders_Gray_CM_D12_Modular-_Web.jpg", "Magnolia": "605_Magnolia_CM_D12_Modular-_Web.jpg", "Napoli": "rrt3kqackolaoezqnmtu.jpg", "Newport Gray": "ll5yrogo8inhp7zldqjn.jpg", "Potomac": "462_Potomac_DF_D12_Modular.jpg", "Rio": "eca9385d0220288d99c211bfee1b70c486e5f679.jpg", "Riviera": "402_Riviera_CM_D12_Modular.jpg", "Savannah": "Belgard_Adams_SEPT2022_SWATCH_Dimensions12_SAVANNAH.jpg", "Scandina Gray": "b980c26a670931550a22990bd86241e4a0ef6a55.jpg", "Sepia": "4d0321f739c2657367a6acc56245d5aa19fb6951.jpg", "Shaded Gray": "cdplj14uhfgo79jzh2wi-2.jpg", "Sonoran Gray": "efa9b0097c37867096570e8e382cbf021dcb446d.jpg", "Teak": "fezwaictnvktug2tgseb-2.jpg", "Toscana": "401_Toscana_CM_D12_Modular.jpg", "Victorian": "2468f9d9397bf27bcf456e675361a962c5de9d03.jpg" },
  },
  "Dimensions 12 80mm": {
    page: "https://www.belgard.com/product/dimensions-12-80mm/",
    sizes: ["6 x 12 x 3 1/8\" / 12 x 12 x 3 1/8\" / 12 x 18 x 3 1/8\""],
    images: { "Anthracite": "eh7bzfnamlf92lm2omrw-2.jpg", "Aspen": "zkcfactbzpguvyxbyb7m-2.jpg", "Cheswick": "3a013e474e917ed6285ca75300a513cfa5795d49-2.jpg", "Hickory": "b8ofrgw4dnrlctcrheyk.jpg", "Iron Bay": "e8jetzc2og5bfeebvkcr.jpg", "Rio": "xhosr49ri1cjrdpctmoc.jpg", "Scandina Gray": "b980c26a670931550a22990bd86241e4a0ef6a55.jpg", "Sepia": "13e834971ad69fd7803f237ec2780c627f685ba1.jpg", "Shaded Gray": "a09a5afe2e825770ef480e9c905be9fffe885eff.jpg", "Victorian": "o1awp2izo06hfn3jww2m.jpg" },
  },
  "Dimensions 18": {
    page: "https://www.belgard.com/product/dimensions-18/",
    sizes: ["9 x 18 x 2 3/8\" / 18 x 18 x 2 3/8\" / 18 x 27 x 2 3/8\""],
    images: { "Amber Beige": "a8672ecada95c45c9b2e8d25d55fb912e44c107a.jpg", "Anthracite": "3ae5a2a586615d49594a5ed63fec3143b36e6e76.jpg", "Aspen": "12d2806f79c3e50b8b7ebdbbdfd8eff0f062d064.jpg", "Aspen Blend": "yo5mgddmjp82sg46mspl-2.jpg", "Avondale": "9aa0aebe4fa261aff4f7db5ebc4feea6c299402e.jpg", "Cheswick": "mqho5qytwzgkzorahzcr-2.jpg", "Cliffside": "nhezlugjymqh7tsosuzc-2.jpg", "Danville": "27627a1074b4f3f7ed858d2c19dcdf27816f9064.jpg", "Dune": "x5dkrnypuyq7v1p4pard.jpg", "Galway": "7a0f64a52e14942c99f88f2edd706674961d6362.jpg", "Hatteras": "328_Hatteras_CM_D18_Modular_Web.jpg", "Hickory": "178bd54d05aa6bd2a1639959642b31fc1efa18d8.jpg", "Iron Bay": "us4uoulqhgvswxmo6zez.jpg", "Linen": "shcyjta4tnbbzre0idq4-2.jpg", "Magnolia": "328_Magnolia_CM_D18_Modular_Web.jpg", "Napoli": "63M_Napoli_CM_D18_Modular_Web-1.jpg", "Newport Gray": "508_NC_Newport_Gray_D18_Modular_Web.jpg", "Rio": "eca9385d0220288d99c211bfee1b70c486e5f679.jpg", "Riviera": "bc86502af6ccd5cdd7103ad9f7cd4b85eb24e282.jpg", "Savannah": "4630392ea539e39cf767459fce6b3be6e6cd62e0.jpg", "Scandina Gray": "332d30bef958bb561247b1818ffcf53d3ab8dcc6.jpg", "Sepia": "295daab0baea86b07c0bc6c3c0cae9ade5a12b6f.jpg", "Shaded Gray": "9f2ae4f47db66413bb12670a6d9cdf0afcf43a82.jpg", "Teak": "nffcyqhpnzwh3xbpcnz5-2.jpg", "Toscana": "67ac411f482366533c938d74607905c33469e4e4.jpg", "Victorian": "2468f9d9397bf27bcf456e675361a962c5de9d03.jpg" },
  },
  "Dimensions Antiqued": {
    page: "https://www.belgard.com/product/dimensions-antiqued/",
    sizes: ["3 x 6 x 2 3/8\" / 6 x 6 x 2 3/8\" / 6 x 9 x 2 3/8\"", "6 x 9 x 2 3/8\""],
    images: { "Anthracite": "dkbnu2kqradfsy9jvvdc-2.jpg", "Ashwood": "pvl0v4sind4jdmx64p9w-2.jpg", "Avondale": "347_Avondale_CM_Dimensions_Antiqued_12_Modular.jpg", "Bourbon": "35089721fe3ecea05ebcfae0653c996ae19b198a.jpg", "Cheswick": "nd4udbq20ugv1v3c0hza-2.jpg", "Danville": "o439ps5uy86walrya8ed-2.jpg", "Danville Beige": "p75lcojb1lyjkw7y8h3o-2.jpg", "Hickory": "rrejiekpv3pjkv03x7g7-2.jpg", "Iron Bay": "yqmpzlsdnk7cv5pnxtoq-2.jpg", "Lueders Gray": "d46ikde4nf0c3tuj9ope-2.jpg", "Midnight": "bmedckkmdtvqnaoazgi4.jpg", "Newport Gray": "28ab2c69a786e78e12beb723916479521c3de5b8-2.jpg", "Potomac": "pqr18utm9ldpmhdzvrsw-2.jpg", "Savannah": "ffa3d1cbfbe37457761e5c6b5063a4f6bffb3bca.jpg", "Scandina Gray": "eddruhylkndjfnbk6xr4-2.jpg", "Sepia": "xqqsvygzteefxlr8capu-2.jpg", "Shaded Gray": "l3onebl9shf0u35grym3-2.jpg" },
  },
  "Dimensions Single Units": {
    page: "https://www.belgard.com/product/dimensions-single-units/",
    sizes: ["3 x 3 x 2 3/8\"", "3 x 9 x 3 1/8\"", "3 x 12 x 2 3/8\"", "3 x 12 x 3 1/8\"", "3 x 18 x 3 1/8\"", "6 x 6 x 2 3/8\"", "6 x 9 x 2 3/8\"", "6 x 12 x 2 3/8\"", "9 x 12 x 2 3/8\"", "9 x 18 x 2 3/8\"", "12 x 24 x 2 3/8\"", "15 x 30 x 2 3/8\"", "24 x 24 x 2 3/8\"", "24 x 36 x 2 3/8\""],
    images: { "Anthracite": "403_NC_Anthracite_DF_D6x12_Half_Running_Bond_Web.jpg", "Aspen": "0681fa47c0da181c9e1a2baaa42104b7abd0a807.jpg", "Autumn": "860a04d6b6aece1552ab5b59939d8ff56a073011.jpg", "Bella": "Belgard_Superlite_FEB2023_SWATCH_Dimensions6x9_BELLA.jpg", "Bella Blend": "bmzxoortyw0o9olezjal-2.jpg", "Black Diamond": "p6qtuz8gt4v7vfl6intz-2.jpg", "Bourbon": "672_Bourbon_DF_D6x9_Half_Running_Bond_Web.jpg", "Brown Beige Charcoal": "403_Brown_Beige_Charcoal_DF_D6x9_Half_Running_Bond_Web.jpg", "Charcoal": "lnmfxidf1g3er0myqpuo-2.jpg", "Cheswick": "b458197ba23d85a982cde8ba592378f0506d3349.jpg", "Cream Tan Brown": "gzpndfydejhgmx9lurez-2.jpg", "Fog": "akfnnrqzghgcl3mpv5n0-2.jpg", "Graphite": "d6fec2d032caffc9a3fcbdc8c27be7df980065c0.jpg", "Gray Charcoal": "2413ff54c8a25b5a6995481bedfa635267b2f6f7.jpg", "Gray Charcoal Tan": "scinpu9rlckiqg6oe3or-2.jpg", "Hickory": "342_Hickory_DF_D9x18_Half_Running_Bond.jpg", "Iron Bay": "233_NC_Iron_Bay_DF_D12x24_Half_Running_Bond_Web.jpg", "Linen": "401_Linen_CM_D6x9_Half_Running_Bond_Web.jpg", "Midnight": "f0eebda90eb43f3c77aef8997a672e5a5f422019.jpg", "Montecito": "401_Montecito_CM_D6x9_Half_Running_bond.jpg", "Moonlight": "jcyaha2vdmybhek7klgt-2.jpg", "Napoli": "li2p7kmom41cilfthiq5-2.jpg", "Pearl": "hae8skisvjhhi72fegyh-2.jpg", "Rio": "415_Rio_CM_D6x9_Half_Running_Bond_Web.jpg", "Riviera": "6cc3d11c7a356520c535166f4548173885a8e681.jpg", "Rosewood": "501_NC_Rosewood_DF_D6x12_Half_Running_Bond.jpg", "Scandina Gray": "cb405ca5c2cd05117b758d8f99ea3e6ff3f6b746.jpg", "Sepia": "605_Sepia_DF_D6x12_Half_Running_Bond_Web.jpg", "Shaded Gray": "404_Shaded_Gray_DF_D12x24_Half_Running_Bond_Web.jpg", "Shaded Grey": "tzt8kawvrzawdskuptxh-2.jpg", "Sierra": "c83d5e73e7880891a0f0848383bdd621d10db4a2.jpg", "Sonoran Gray": "404_Shaded_Gray_DF_D12x24_Half_Running_Bond_Web-1.jpg", "Suede": "smpqxnxlc7g85kmy8gvu-2.jpg", "Tan Brown Charcoal": "403_Tan_Brown_Charcoal_DF_D6x9_Half_Running_Bond_Web.jpg", "Tan Red Charcoal": "403_Tan_Red_Charcoal_DF_D6x9_Half_Running_bond_Web.jpg", "Toscana": "iaryhi3zfvkzos3vusdx-2.jpg", "Victorian": "5250d856b802c73d56c5688fbb97b92455efce54.jpg" },
  },
  "Dimensions Slabs": {
    page: "https://www.belgard.com/product/dimensions-slabs/",
    sizes: ["12 x 24 x 2 3/8\"", "15 x 30 x 2 3/8\"", "24 x 24 x 2 3/8\"", "24 x 36 x 2 3/8\""],
    images: { "Anthracite": "edb4d8f47225b9991e47e521f9800cb88fd7d49a.jpg", "Aspen": "fe9a1d8d754f6d4d1b85522ee947fea23e14bc39.jpg", "Bella": "3e0a80b639bbe61062750e52bc4d298ac0b5fd38.jpg", "Cheswick": "ymgcuvzdrpszlsrt6r5z-2.jpg", "Fog": "v4e0r5wl2hupxe1a6in7-2.jpg", "Hickory": "6a15ac77cbf4906730273657ecc4418f2e15d864.jpg", "Iron Bay": "uff9py925ssnw8zqk3c4-2.jpg", "Linen": "shcyjta4tnbbzre0idq4-2.jpg", "Midnight": "vhqvh57a1asf3zrmgcn8.jpg", "Pearl": "mne0pfgfjzmycyrfv9pf-2.jpg", "Rio": "1ff4ce0da9900dfad06cd9d65b9ba9f2f007785a.jpg", "Riviera": "e6kt7ugjbplt93cfbgvn-2.jpg", "Scandina Gray": "7c2c3d4a0a3a2b964dddd7fa33317bd1fb29c685.jpg", "Sepia": "9a213f49c116933a41096c148957e3aa0857504b.jpg", "Shaded Gray": "403_NC_Shaded_Gray_DF_D12x24_Half_Running_Bond_Web.jpg", "Sonoran Gray": "3619ba1092383cad18911189e297f145cbe2d1f5.jpg", "Suede": "oqtirhjiyhlpdmmkkxoq-2.jpg", "Victorian": "6f0770353d0c826c0174e6d082acef98a5027135.jpg" },
  },
  "AB Classic": {
    page: "https://www.belgard.com/product/ab-classic-collection/",
    sizes: ["8 x 18 x 12\"", "8 x 16 x 8\"", "4 x 18 x 12\""],
    images: { "Brown Beige Charcoal": "33d73ebed1a483370922d31c19ef55ef4293fc28.jpg", "Buff": "0f8270523c5b546498db8b60b3edf42ed5e51aa9-2.jpg", "Charcoal": "7a69cfe6afc2f81332f2f91cff9a655f01aaad12-2.jpg", "Dakota Blend": "bb972d8469c65cd8bf2c3eb847a61a6982c2a77c-2.jpg", "Danville Blend": "699d36b74de58e48a3f721b730a37d535aa5d6d0-2.jpg", "Driftwood": "edzb00pqrkxuhgpa1uhs.jpg", "Granite Gray": "dbbf17e785611f18e4d9990217e4ce7d5eee22b4.jpg", "Gray": "6b6c80f8c95a2a4f05474c6a4c81e44687d96b8b.jpg", "Gray Charcoal Tan": "b2aa00093a63b62b2fd7f332a78e05db9e1d5e1e.jpg", "Grey": "emd2iabxrfgju6fa0m5i-2.jpg", "Mocha": "mhebot3feddoi2j5iqd8.jpg", "Pewter Blend": "68404fd409a951ad6b6ff0b74f5b633f9787571b-2.jpg", "Rocky Mountain": "plbsahsemja44dtsjntf-2.jpg", "Sable": "4acf6074e484521380e06270db38f7f3795d5a73.jpg", "Sable Blend": "n0xsfssqkstmgf1xh9c8.jpg", "Silverado": "5377d34a572b8887d894352fea41e98605cb3b42.jpg", "Tan": "621bbc77417882ae56a1a0dca6d93f473a4e4fa7.jpg", "Tan Brown Charcoal": "0ae2359318f407dfc30f0a1e56ccf4e9c6b386d1.jpg", "Thunderhead": "pbl0vacfaylzzglg8fut.jpg", "Toccoa": "llk5uvzsn5x10whzjrne-2.jpg" },
  },
  "Easton Stone": {
    page: "https://www.belgard.com/product/easton-stone/",
    sizes: ["4 x 8 / 5 x 8\" / 4 x 12 / 9 x 8\" / 4 x 16 / 13 x 8\"", "4 x 12 x 8\""],
    images: { "Amaretto": "940949c40f93d71bdcebfcffb7fa9f458be85e95.jpg", "Anthracite": "403_NC_Anthracite_CM_Easton_Stone_Color_Swatch_Web-1.jpg", "Bella": "1a726f831069e01fb1ad1ed99e8310a7fb8410ad.jpg", "Danville Beige": "442ecb2eaccb452f69d9726e70c48aba01556e0e-2.jpg", "Hickory": "462_NC_Hickory_CM_Easton_Stone_Color_Swatch_Web-1.jpg", "Lueders Gray": "bwpk93gc1plnmvvgfh5r.jpg", "Midnight": "6acd55cf941501aa162ea02f40a426e17ee19cc5.jpg", "Napoli": "e5e44038e91902f8e03a069d3fa26ace405e91ec.jpg", "Rainier": "7b3da6eeafedcfa48bc1b1aeeb66ff88852eb49b-2.jpg", "Rio": "dqlkcaguhf4n5kvoe1gz.jpg", "Shaded Gray": "403_NC_Shaded_Gray_CM_Easton_Stone_Color_Swatch_Web-1.jpg", "Sierra": "879c01bb4471f2891d7d9e212b8916c463f192ad.jpg", "Slate": "42299cd1dfcdc28a06ecf1faf95efdb8803d45a1-2.jpg", "Victorian": "b4b684cff2021b24aed5c462eaaa642fb4759698.jpg" },
  },
  "Artforms": {
    page: "https://www.belgard.com/product/artforms/",
    sizes: ["18 x 36 x 3\"", "6 x 36 x 3\""],
    images: { "Anthracite": "00c5f8a45ee843f4c3c5c567f22338d4dc1e51ca.jpg", "Hickory": "5b00c94bb4b64933b51eec9ed0075ae314e7d166.jpg", "Rockland Black": "54c63cc946398f6dddae683551092debaffec2b0-2.jpg", "Scandina Gray": "gncccravim1clccvjk6i-2.jpg" },
  },
  "Ashlar Tandem Wall": {
    page: "https://www.belgard.com/product/ashlar-tandem-wall/",
    sizes: ["7 x 13 3/16 x 2 5/8\" / 7 x 15 13/16 x 2 5/8\" / 7 x 18 7/16 x 2 5/8\""],
    images: { "Avondale": "xgpof3rrbnjzgjteuh67.jpg", "Cheswick": "v8plgikdrp5sjpbf9hcv.jpg", "Newport Gray": "tfxmjghgos7zeiwsphax.jpg", "Pewter": "ctcqslszb1wmpxfbmsuz.jpg", "Rainier": "chjqynwth4xhgofvy4iv-2.jpg", "Rio": "647b4b345cb218532a2e83f474af729ed1a44c48-2.jpg", "Riviera": "2d668e0fd00b9755eded4e29808526fb4052ee63.jpg", "Scandina Gray": "k5cogiwik6vd9c7qwqji.jpg", "Shelby": "7cd6cb9f9a098194d30eaac448c3bfb49da3e41e.jpg", "Sierra": "fa76e5e88595aaa88ba69962dd0ac8761638c171.jpg", "Toscana": "1066df65991f454311341372c75f3391e197cde3.jpg", "Victorian": "2f298c9418043183c5a09cd996e8dfafa88fff98.jpg" },
  },
  "Belair Wall": {
    page: "https://www.belgard.com/product/belair-wall/",
    sizes: ["6 x 8\" / 6 x 11\" / 6 x 16\" / 14 x 11\"", "6 x 8 x 8\" / 6 x 16 x 8\" / 6 x 16 x 8\" (w/micro joint)", "6 x 16 x 8\"", "6 x 8 x 11\"", "3 x 8 x 13 1/2\"", "3 x 8 x 12\""],
    images: { "Ashwood": "da50401075fb767f4e8fee2bcc14c6f6aa740ad4-2.jpg", "Hickory": "8e113787262feabd6dae03c0aa1ae159699df047.jpg", "Iron Bay": "0a808ee946111a300e501632ca20d180c0760fe8.jpg", "Newport Gray": "tabloecsqxoiaktuxhqd.jpg", "Shaded Gray": "3b6d19db8f4bf7d8e82f7a18496ffcef7f6e99a6.jpg" },
  },
  "Belair Wall 2.0": {
    page: "https://www.belgard.com/product/belair-wall-2-0/",
    sizes: ["6 x 6 x 5\" / 6 x 10 x 5\" / 6 x 16 x 5\"", "6 x 6 x 8\" / 6 x 10 x 8\" / 6 x 16 x 8\"", "6 x 16 x 8\"", "3 x 7 / 8 x 13 1/2\"", "3 x 8 x 13 1/2\""],
    images: { "Midnight": "slada5svn3tbgx4cnhit-2.jpg", "Napoli": "dbeca394fed4ef933a86cd78a046111c06241916.jpg", "Rio": "93d6b77c76113099d3bbba022d1f98e52136e9ff.jpg", "Shaded Gray": "qtknb6pq8c4ygrfuo86i.jpg", "Slate": "2686910bd64c79c86bf70edc2937db4902142d0c.jpg", "Toscana": "4fe07f6d5f3c6fa110d1aea694393cc1ecee9387.jpg", "Victorian": "nzwlm8v2xq4hbw2f4jrv-2.jpg" },
  },
  "Brisa": {
    page: "https://www.belgard.com/product/brisa/",
    sizes: ["6 x 6 x 5\" / 6 x 10 x 5\" / 6 x 16 x 5\"", "6 x 6 x 8\" / 6 x 10 x 8\" / 6 x 16 x 8\"", "6 x 8 x 11\"", "6 x 16 x 8\""],
    images: { "Heritage": "008d12a3d971f51afefa618f6d37ec84275478dd.jpg", "Moonlight": "a4ab456a7f6d01c728e67347971f417f95fa51b2.jpg", "Newport Gray": "fd7e151873928769a2cbd753596e7c584c902812.jpg" },
  },
  "Castlemanor Grana": {
    page: "https://www.belgard.com/product/castlemanor-grana/",
    sizes: ["6 x 6/4 x 10\" / 6 x 12 / 10 x 10\" / 6 x 16 / 14 x 10\""],
    images: { "Avondale": "xzl8eosyhe8werwi45gx.jpg", "Colonial": "1f369ac9bf67dae5d3428add464773a6cf408a7b.jpg", "Midnight": "kknbxzhurumwzzxexpjp.jpg", "Misty Mountain": "zrx9n4ih7ar2jxd6h6hs-2.jpg", "Napoli": "u0ead6g9yxcjxe6hkuul-2.jpg", "Oxford": "dd1a53dc4c7a3e001dccf956c749ab234910d7b3.jpg", "Potomac": "mgr5ink3xvxaefqb5mdo-2.jpg", "Savannah": "t9isobxffl0dlqrr4xmw.jpg", "Slate": "ldpbbo84hwn0wsim19yu-2.jpg", "Teak": "d43f8285ed31045ad69e38bfb307acb8335fdd66.jpg" },
  },
  "Castlemanor Rustic": {
    page: "https://www.belgard.com/product/castlemanor-rustic/",
    sizes: ["6 x 6/4 x 10\" / 6 x 12/10 x 10\" / 6 x 16/14 x 10\""],
    images: { "Colonial": "gcxitu8uvb62qbvj8du9.jpg", "Misty Mountain": "gvei1ntedz3rjfhsykvi.jpg", "Napoli": "b1b74687f814acb3b46050b70933bceef59c173c.jpg", "Potomac": "qgciu3czemzv1ngwqqau.jpg", "Slate": "COASTAL_OCT2019_BEL_SWATCH_CastleManor_SLATE.jpg" },
  },
  "Coventry Wall III": {
    page: "https://www.belgard.com/product/coventry-wall-iii/",
    sizes: ["6 x 8 x 10\" / 6 x 10 x 10\" / 6 x 16 x 10\"", "6 x 16 x 10\"", "3 x 12 x 16\""],
    images: { "Dakota Blend": "awuxntdxmgldgwrwbv3x-2.jpg", "Harvest Blend": "lfsy0fxbwgw4v7bgquqn.jpg", "Pewter Blend": "k0fuymav2qq0yss9jbwv-2.jpg" },
  },
  "Highland Stone": {
    page: "https://www.belgard.com/product/highland-stone/",
    sizes: ["6 x 6 x 12\" / 6 x 12 x 12\"", "6 x 18 x 9\"", "6 x 17 3/4 x 9\"", "6 x 6 x 9\" / 6 x 12 x 9\"", "3 x 18 x 13\""],
    images: { "Ashwood": "v4l4vccmihixtsw1tksx.jpg", "Bella": "02dab78e2d39495f8cf9c72d479e6aa2929389e9.jpg", "Brittany Beige": "81a83a3e154c36b4b83d56194ed629d33747224a-2.jpg", "Brownstone": "e28586e1dfbb8c830e64e1a1576a69e7f8499bc9-2.jpg", "Carriage House": "92e076a06667ed4eac2a219a0d9e76a13552f469-2.jpg", "Cliffside": "rdlkawi4fqgiexziknxm.jpg", "Graystone": "266af45dfdc96bfd8f629d3fa5225c5900d01a14-2.jpg", "Iron Bay": "iurscpu4flvlzahe51k9.jpg", "Misty Mountain": "ja4koahbcvbmyhleulcc.jpg", "Oxford": "65003bb53ee16bdcfadd9f68f543fcdb51b86b24.jpg", "Oxford Charcoal": "65003bb53ee16bdcfadd9f68f543fcdb51b86b24.jpg", "Potomac": "zh8mcqdz0m5rw7qodz6g.jpg", "Rio": "q4csr1sg3bmfiyecyb8y-2.jpg", "River Blend": "0c6c76bcd851f6ad0c0e1781652c6ae51545b135-2.jpg", "Sandstone": "f50899e46bc2dc0aed016bd20415d9307da4f48b-2.jpg", "Savannah": "hgxwesor4auj1j4fgfyh.jpg", "Shaded Gray": "lqfvp8zrm3r7skylsmz8.jpg", "Shadow": "yrlcwx79i2krpkam5lwc-2.jpg", "Sheffield": "0f7fd6a220ed5dc0a14219785ad2ec2024def565.jpg", "Timberline": "adcb8db774f9d56bed8a4d962d8bd885f180ef54.jpg", "Toscana": "rnvyhd8usktqsur9ekor-2.jpg", "Victorian": "zlg3leh219ca2exwujxc-2.jpg" },
  },
  "Lamina Tandem": {
    page: "https://www.belgard.com/product/lamina-tandem/",
    sizes: ["7 x 13 3/16 x 2 5/8\" / 7 x 15 13/16 x 2 5/8\" / 7 x 18 7/16 x 2 5/8\""],
    images: { "Pewter": "0f7bfbe327821b51412b23df4709f1542e6a1a71-2.jpg", "Scandina Gray": "1f79551b3eb6c8656b7b03816bed1004dc0816b7.jpg", "Sienna": "1d0a0b7c1e22ec659ded007c0d5a40fda3e43c5a-2.jpg" },
  },
  "Melville Tandem Wall": {
    page: "https://www.belgard.com/product/melville-tandem-wall/",
    sizes: ["7 x 13 3/16 x 2 5/8\" / 7 x 15 13/16 x 2 5/8\" / 7 x 18 7/16 x 2 5/8\""],
    images: { "Anthracite": "391_Anthracite_CM_Melville_Tandem_Linear.jpg", "Midnight": "74b08abdf4226eb7cfe1805e5ffa7aa57ca45e5c-2.jpg", "Newport Gray": "6213f5c5d151aae839c2ead9533656cf620c4597-2.jpg", "Rio": "96beb7e5d0318f276697e46a7ef09f8236b67777.jpg", "Riviera": "fce0679dc3a250d5ae3c70785d7c56747be15d9b.jpg", "Scandina Gray": "403_NC_Scandina_Gray_CM_Melville_Tandem_Linear_web.jpg", "Toscana": "5d5c3c9714288bcfd1031abaeddfd7fc27a7a5d7.jpg", "Victorian": "1ce3a42966dc6c53f8239366d119041736c599af.jpg" },
  },
  "Melville Wall": {
    page: "https://www.belgard.com/product/melville-wall/",
    sizes: ["4 x 20 x 10\"", "4 x 9 1/2 x 10\"", "2 x 20 x 13\""],
    images: { "Amber Beige": "dxswfzuccoutulnscnm9-2.jpg", "Anthracite": "agfd74atifynvtel2s7u.jpg", "Bella": "k5gqxbdjhdamozbfbhqq.jpg", "Cliffside": "c0qkqxmgn2psbw1ojkpn.jpg", "Hatteras": "a97daa7e9b101354158abc81eea8964602b81027-2.jpg", "Hickory": "qgvhqzesfagxy6wwpcof.jpg", "Linen": "6c82178a47d0cd4b2d7e0056be7e44b54e00bf84.jpg", "Lueders Gray": "x7zgeele1d7tfyqvyb8i-2.jpg", "Midnight": "khgktvrrqijkj3zsev4b.jpg", "Napoli": "bbegwys1naq7owy7xsv3.jpg", "Rio": "a1mtm1tuxbfh6kbwppuv-2.jpg", "Riviera": "fce0679dc3a250d5ae3c70785d7c56747be15d9b.jpg", "Scandina Gray": "9f2de0692fef6fd719a578f523d5a2ad23ddb47d.jpg", "Shaded Gray": "fpvbfbyslpark8cxiu3a.jpg", "Slate": "f458be9d7baab54e5b94b0f917fd65d103d15a82.jpg", "Sonoran Gray": "23c18c994eb3f5b1c76b0d106154ef35707de8dd-2.jpg", "Victorian": "a556b9a2c52224b97b36717d0ea371f8a05a6c17-2.jpg" },
  },
  "Papyrus Artforms": {
    page: "https://www.belgard.com/product/papyrus-artforms/",
    sizes: ["18 x 36 x 3\""],
    images: { "Hickory": "zcurfwdasor1xf5wmttq.jpg", "Scandina Gray": "lhrsd4dlxa4h1f3hfiar.jpg" },
  },
  "Melville Curb": {
    page: "https://www.belgard.com/product/melville-curb/",
    sizes: ["4 x 24 x 6 1/2\""],
    images: { "Anthracite": "SS_404_Anthracite_DF_Seamless_Web.jpg", "Bourbon": "bjerc1soitordrontvrs.jpg", "Fog": "iwuzciivddtfhwlqso5v.jpg", "Hatteras": "cnvek2enbeikiy8zznlh.jpg", "Hickory": "SS_508_Hickory_DF_Seamless_Web.jpg", "Midnight": "o82spfnu8qd7ms6gdo2m.jpg", "Pearl": "mixnx6xy81vm4ga9bggv.jpg", "Rio": "k9zd9gyypvarmdeckhx6.jpg", "Toscana": "fgq7o1zlzpj8ppnqbwz4-2.jpg", "Victorian": "129a05f69ed29bbc7236646ba20a860ab78787d3.jpg" },
  },
};

/** The swatch photo URL for a line and color, if Belgard has one. */
export function makerImage(line: string, color: string): string | undefined {
  const p = BELGARD_MEDIA[line]?.images[color];
  return p ? (/^https?:/.test(p) ? p : IMAGE_BASE + p) : undefined;
}
