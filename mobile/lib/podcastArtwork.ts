import * as ImagePicker from 'expo-image-picker'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'

const ARTWORK_SIZE = 512
const JPEG_QUALITY = 0.85

// Lets the user pick a photo from their library to use as a show's custom
// artwork, then center-crops and downsamples it to a square JPEG data URL —
// mirrors the desktop app's resizeImageToDataUrl (src/renderer/src/utils/
// imageResize.ts) so the override looks the same and stays a similar size
// regardless of which platform it was set from. Returns null if the user
// cancels the picker.
export async function pickPodcastArtwork(): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
  if (permission.status !== 'granted') {
    throw new Error('Photo library access is required to set custom artwork')
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 1
  })
  const asset = result.assets?.[0]
  if (result.canceled || !asset) return null

  const cropSize = Math.floor(Math.min(asset.width, asset.height))
  const image = await ImageManipulator.manipulate(asset.uri)
    .crop({
      originX: Math.floor((asset.width - cropSize) / 2),
      originY: Math.floor((asset.height - cropSize) / 2),
      width: cropSize,
      height: cropSize
    })
    .resize({ width: ARTWORK_SIZE, height: ARTWORK_SIZE })
    .renderAsync()
  const saved = await image.saveAsync({
    format: SaveFormat.JPEG,
    compress: JPEG_QUALITY,
    base64: true
  })
  if (!saved.base64) throw new Error('Failed to encode the selected image')
  return `data:image/jpeg;base64,${saved.base64}`
}
