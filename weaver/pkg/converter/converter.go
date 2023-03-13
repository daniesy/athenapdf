package converter

type Converter interface {
	Convert(ConversionSource, <-chan struct{}) ([]byte, error)
	Upload(string, []byte) (bool, error)
}
