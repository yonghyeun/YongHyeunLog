import type {
  Source,
  FilePaths,
  Directory,
  MDXSource,
  ImgSource,
  PostInfo,
  SeriesName,
} from '@/types/post';

const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

/**
 * source 가 특정 경로인지, 파일인지를 확인하는 메소드
 */
const isDirectory = (source: Source): source is Directory => {
  return fs.lstatSync(source).isDirectory();
};

/**
 * source 에 존재하는 file이 mdx 파일인지 확인하는 메소드
 * 이 때 반환값에 타입 가드를 설정해주도록 한다.
 */
const isMDX = (source: Source): source is MDXSource => {
  const fileName = path.basename(source);
  return path.extname(fileName) === '.mdx' || path.extname(fileName) == '.md';
};

/**
 * source를 public에 대한 상대 경로로 변경해주는 메소드
 */
const translatePath = (source: Source): Source => {
  const relativePath = path.relative(
    path.join(process.cwd(), 'public'),
    source,
  );

  return `/${relativePath.replace(/\\/g, '/')}`;
};

/**
 * 필수 전제 조건 :
 * 1. postThumbnail 을 사용하려면 meta 데이터에 thumb 에 대한 주소가 존재해야 함
 */
const getValidThumbnail = (
  source: MDXSource,
  data: PostInfo['meta'],
): Source => {
  /**
   * postThumb 에 대한 정보를 확인한다.
   * 기존엔 절대경로로 확인했으나 vercel 배포 버전에서도 인식 할 수 있도록 상대경로를 이용하여 fs.exsitSync 사용
   * 해당 코드는 dev 모드에선 작동하지 않고 vercel 배포 버전에서는 잘 작동함
   */
  if (data.thumb) {
    const postThumb = path
      .join(source, '..', path.basename(data.thumb))
      .replace(/\\/g, '/'); // 혹시 경로가 \ 로 작성된 경우엔 / 로 replace

    if (fs.existsSync(postThumb)) {
      return translatePath(postThumb);
    }
  }
  // 2. seriesThumbnail 이 있는지 확인
  const extnames = ['jpg', 'svg', 'png', 'gif'];
  const possibleThumbnailPath = extnames.map(
    (extname) => `${path.join(source, '../..', 'thumbnail')}.${extname}`,
  );

  const seriesThumbnail = possibleThumbnailPath.find((seriesThumbPath) => {
    return fs.existsSync(seriesThumbPath);
  });
  return translatePath(seriesThumbnail as ImgSource);
};

/**
 * Directory 인 source 하위에 존재하는 모든 폴더,파일들의 경로를 반환하는 메소드
 */
const getAllPath = (source: Source): FilePaths => {
  return fs
    .readdirSync(source)
    .map((fileName: string) => path.join(source, fileName));
};

const getSeriesName = (source: MDXSource): SeriesName => {
  const seriesPath = path.join(source, '../..');
  return path.basename(seriesPath);
};

const filterContent = (content: PostInfo['content']) => {
  const splitedContent = content.split('\r\n');

  return splitedContent
    .map((text) => {
      return text.startsWith('#') ? text.replace(/`/g, '') : text;
    })
    .join('\r\n');
};

const parsePosts = (source: Source): Array<PostInfo> => {
  const Posts: Array<PostInfo> = [];

  const parseRecursively = (source: Source): void => {
    getAllPath(source).forEach((fileSource: Source) => {
      if (isDirectory(fileSource)) {
        parseRecursively(fileSource);
      } else {
        if (isMDX(fileSource)) {
          const fileContent = fs.readFileSync(fileSource, 'utf8');
          let { data, content } = matter(fileContent);
          /* 만약 h1~h3에서 백틱이 존재한다면 라우팅 기능이 되지 않으니 필터링 해주자 */
          content = filterContent(content);

          /* data.postId 가 존재하지 않으면 PostID 를 생성한 후 Post 저장*/
          if (!data.postId) {
            data.postId = Math.ceil(Math.random() * 9 * 100000);
            const updatedContent = matter.stringify(content, data);
            fs.writeFileSync(fileSource, updatedContent, 'utf-8');
          }
          /* data.date , time 이 존재하지 않으면 build 타임 기준으로 하여 생성 */
          if (!data.date) {
            data.date = new Date().toDateString();
            data.time = new Date().getTime();
            const updatedContent = matter.stringify(content, data);
            fs.writeFileSync(fileSource, updatedContent, 'utf-8');
          }

          /* 추후 이미지 파일에 접근하기 위해 해당 포스트가 존재하는 폴더 명을 meta 데이터에 저장 */
          const directoryPath = path.join(fileSource, '..');
          const relatevePath = directoryPath.split('public')[1];

          Posts.push({
            meta: {
              ...data,
              series: getSeriesName(fileSource),
              validThumbnail: getValidThumbnail(fileSource, data),
              path: relatevePath,
            },
            content: content,
          });
        }
      }
    });
  };

  parseRecursively(source);

  return Posts;
};
/**
 * Posts 에서 Date 를 기준으로 정렬 후 전송
 */
export const getAllPosts = (): Array<PostInfo> => {
  const POST_PATH = path.join(process.cwd(), 'public/posts');
  const posts = parsePosts(POST_PATH);

  return posts.toSorted((prev, cur) => {
    const prevTime = prev.meta.time;
    const curTime = cur.meta.time;

    return curTime - prevTime;
  });
};

const isPostHasTag = (
  postTag: PostInfo['meta']['tag'],
  searchParmsTag: string,
) => {
  // searchParamsTagArray
  const SPTArray = searchParmsTag.split('&');
  return SPTArray.every((spt) => postTag.includes(spt));
};

/**
 * SearchParms 에 맞게 적절한 PostList 를 반환하는 메소드
 */
export const selectPosts = (searchParams: URLSearchParams): Array<PostInfo> => {
  const allPosts = getAllPosts();
  const tag = searchParams.get('tag');
  const series = searchParams.get('series');

  if (!tag && !series) {
    return allPosts;
  }
  return allPosts.filter((post) => {
    const { meta } = post;
    return (
      (!tag || isPostHasTag(meta.tag, tag)) &&
      (!series || meta.series === series)
    );
  });
};

export const getPostContent = (postId: string): PostInfo => {
  const allPosts = getAllPosts();
  const searchedPost = allPosts.find(
    (post) => post.meta.postId === Number(postId),
  );

  return searchedPost as PostInfo;
};
